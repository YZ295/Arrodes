/**
 * Arrodes 桌面版主进程
 *
 * 架构：
 *  - 后端（Express + WebSocket）作为 Node 子进程运行（server/dist/index.js）
 *  - Electron 主进程只负责：拉起后端、等就绪、开窗口
 *  - 窗口关闭 → 停后端 → 退出
 *
 * 打包：electron-builder（asar + node 运行时 + 后端依赖）
 * 后端子进程用 process.execPath 里内置的 Node 运行，无需系统 Node。
 */
import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, dialog, session, screen } from 'electron';
import { fork, spawn, ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 资源根：dev = desktop/..；prod = resources/app.asar（窗口图标等资源）
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.ARRODES_PORT || 3002);
app.setName('arrodes');
app.setAppUserModelId('com.arrodes.desktop');
app.setPath('userData', resolve(app.getPath('appData'), 'arrodes'));


let backendProc: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let localAccessToken = '';
let localAccessCookieUrl = '';
/** 主动退出标记：置位后后端退出不再弹"意外退出"提示 */
let quitting = false;

/** 定位后端入口 JS */
function findBackendEntry(): string | null {
  // 打包后：resources/server/dist/index.js（extraResources 拷贝）
  // 开发时：desktop/dist/../../server/dist/index.js（回到项目根）
  const candidates = [
    resolve(__dirname, '../../server/dist/index.js'),         // dev
    resolve(process.resourcesPath, 'server/dist/index.js'),  // prod (extraResources)
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** 探测端口是否已被占用（启动前预检，避免误连他人服务） */
function isPortInUse(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolveOk) => {
    const sock = net.connect({ port, host });
    sock.once('connect', () => { sock.destroy(); resolveOk(true); });
    sock.once('error', () => { sock.destroy(); resolveOk(false); });
  });
}

/** 轮询 /api/health 直至 200（就绪后才开窗） */
function waitForHealth(port: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolveOk, reject) => {
    const deadline = Date.now() + timeoutMs;
    let scheduled = false;
    const retry = () => {
      if (scheduled) return;
      if (Date.now() > deadline) {
        reject(new Error(`服务就绪超时（${timeoutMs / 1000}s），/api/health 未返回 200`));
        return;
      }
      scheduled = true;
      setTimeout(() => { scheduled = false; tryHealth(); }, 300);
    };
    const tryHealth = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/api/health', timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) { resolveOk(); return; }
        retry();
      });
      req.on('timeout', () => { req.destroy(); retry(); });
      req.on('error', retry);
    };
    tryHealth();
  });
}

/** 启动后端子进程 */
async function startBackend(): Promise<void> {
  // REQ-004：启动前端口预检，占用即报错退出，不 spawn（避免误连他人服务）
  if (await isPortInUse(PORT)) {
    throw new Error(`端口 ${PORT} 已被其他程序占用。请先关闭占用该端口的进程，再启动阿罗德斯。`);
  }

  const entry = findBackendEntry();
  if (!entry) {
    console.error('[Desktop] 找不到后端入口 server/dist/index.js');
    throw new Error('后端入口缺失');
  }

  // fork 子进程跑后端；NODE_ENV=production 触发静态托管 client/dist
  // ELECTRON_RUN_AS_NODE=1：让 electron.exe 以纯 Node 模式运行后端（否则会再开一个 Electron）
  // 关键：清空 NODE_OPTIONS——宿主环境（如 WorkBuddy）注入的 --require/--use-system-ca
  //       会被 Electron 的 Node 模式拒绝，导致"启动错误"。
  // 数据一致性：cwd 固定为 server 目录、DB_PATH 传绝对路径（可用 ARRODES_DB_PATH 覆盖，
  // 例如打包安装到 Program Files 等只读位置时把库放到用户数据目录），
  // 否则相对路径 ./data 会随 Electron 启动目录漂移（曾造成根 data/ 与 server/data/ 双库分裂）。
  const serverDir = resolve(dirname(entry), '..');
  const devUrl = process.env.ARRODES_DEV_URL;
  const uiUrl = new URL(devUrl || `http://localhost:${PORT}`);
  const uiOrigin = uiUrl.origin;
  localAccessCookieUrl = uiOrigin;
  localAccessToken = randomBytes(32).toString('base64url');
  const dbPath = process.env.ARRODES_DB_PATH
    ? resolve(process.env.ARRODES_DB_PATH)
    : app.isPackaged ? resolve(app.getPath('userData'), 'data') : resolve(serverDir, 'data');

  backendProc = fork(entry, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      DB_PATH: dbPath,
      TTS_OUTPUT_DIR: resolve(dbPath, 'tts-output'),
      COSYVOICE3_PORT: '12003',
      COSYVOICE3_SIDECAR_URL: 'http://127.0.0.1:12003',
      ARRODES_LOCAL_TOKEN: localAccessToken,
      ARRODES_UI_ORIGIN: uiOrigin,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_OPTIONS: '', // 清除宿主注入的 NODE_OPTIONS
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  backendProc.stdout?.on('data', (d) => process.stdout.write(`[Backend] ${d}`));
  backendProc.stderr?.on('data', (d) => process.stderr.write(`[Backend:err] ${d}`));
  backendProc.on('exit', (code) => {
    console.log(`[Desktop] 后端退出 code=${code}`);
    backendProc = null;
    // REQ-005：非主动退出（启动失败除外）→ 弹窗提示并退出，避免窗口挂在死应用上
    if (!quitting && (mainWindow || petWindow)) {
      dialog.showErrorBox('阿罗德斯 - 后端已退出', `后端服务意外退出（code=${code ?? 'unknown'}）。应用即将关闭。`);
      app.quit();
    }
  });

  // REQ-003：/api/health 返回 200 才开窗
  await waitForHealth(PORT);
  await session.defaultSession.cookies.set({
    // Cookie 必须属于实际渲染 UI 的主机名；开发时 UI 可能是 127.0.0.1 而非 localhost。
    url: localAccessCookieUrl,
    name: 'arrodes_local_access',
    value: localAccessToken,
    httpOnly: true,
    sameSite: 'strict',
    secure: new URL(localAccessCookieUrl).protocol === 'https:',
    path: '/',
  });
  console.log(`[Desktop] 后端就绪 -> http://localhost:${PORT}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: '阿罗德斯',
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: resolve(ROOT, 'client/dist/favicon.svg'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.ARRODES_DEV_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // 首版还没有托盘入口；关闭主窗口时一并退出，避免留下无法关闭且不再观察的僵尸桌宠。
    if (!quitting) app.quit();
  });
}


let gatewayProc: ChildProcess | null = null;
const dlog = (msg: string) => console.log(`[Desktop] ${msg}`);
const GATEWAY_CLI = process.env.ARRODES_GATEWAY_CLI || 'E:/AI/Workbuddy/resources/app.asar.unpacked/cli/dist/codebuddy.js';
const GATEWAY_PORT = process.env.ARRODES_GATEWAY_PORT || '8321';

function probeGateway(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: Number(GATEWAY_PORT), path: '/api/v1/health', timeout: 2000 }, (res) => {
      res.resume(); // 任何 HTTP 响应（含 401）都说明有服务在
      resolve(true);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function ensureGateway(): Promise<void> {
  if (!existsSync(GATEWAY_CLI)) {
    console.log('[Desktop] 未找到网关 CLI（ARRODES_GATEWAY_CLI），跳过拉起');
    return;
  }
  if (await probeGateway()) {
    console.log(`[Desktop] 网关已在运行（port ${GATEWAY_PORT}），跳过`);
    return;
  }
  try {
    // detached + unref：网关独立于 Arrodes 生命周期（它服务 WorkBuddy 集成，Arrodes 退出不应杀它）
    // ELECTRON_RUN_AS_NODE：打包后 process.execPath 是 electron.exe，需以纯 Node 模式跑 CLI
    const child = spawn(process.execPath, [GATEWAY_CLI, '--serve', '--port', GATEWAY_PORT], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
    });
    child.unref();
    gatewayProc = child;
    dlog(`gateway started (port ${GATEWAY_PORT})`);
    console.log(`[Desktop] 网关已拉起（port ${GATEWAY_PORT}，detached）`);
  } catch (err) {
    console.warn('[Desktop] 网关拉起失败（端口被占或 CLI 异常）:', err);
  }
}


if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    try {
      if (!process.argv.includes('--smoke-test')) await ensureGateway();
      await startBackend();
      if (!process.argv.includes('--smoke-test')) await createWindow();
      console.log('[Desktop] READY arrodes');
      if (process.argv.includes('--smoke-test')) setTimeout(() => app.quit(), 8000);
    } catch (error) {
      console.error('[Desktop] STARTUP FAILED', error);
      quitting = true;
      if (backendProc?.connected) backendProc.send('shutdown'); else backendProc?.kill();
      if (!process.argv.includes('--smoke-test')) dialog.showErrorBox('阿罗德斯启动失败', String(error));
      app.exit(1);
    }
  });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { quitting = true; if (backendProc?.connected) backendProc.send('shutdown'); else backendProc?.kill(); });
