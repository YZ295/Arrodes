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
import { app, BrowserWindow, Menu, ipcMain, shell, dialog, session, screen } from 'electron';
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
    : resolve(serverDir, 'data');

  backendProc = fork(entry, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      DB_PATH: dbPath,
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

function getUiUrl(surface?: string): string {
  const url = new URL(process.env.ARRODES_DEV_URL || `http://localhost:${PORT}`);
  if (surface) url.searchParams.set('surface', surface);
  return url.toString();
}

async function createPetWindow() {
  const width = 660;  // 左侧留出气泡区，人物站右侧
  const height = 600;
  const { workArea } = screen.getPrimaryDisplay();
  petWindow = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 18,
    y: workArea.y + workArea.height - height - 18,
    title: '阿罗德斯桌面管家',
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: true,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: join(__dirname, 'petPreload.cjs'),
    },
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.setIgnoreMouseEvents(true, { forward: true });
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('context-menu', () => showPetContextMenu());
  dlog('pet window created (hidden)');
  petWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    dlog(`pet did-fail-load code=${code} desc=${desc} url=${String(url).slice(0, 120)}`);
  });
  petWindow.once('ready-to-show', () => {
    dlog('pet ready-to-show -> showInactive');
    petWindow?.showInactive();
  });
  // 兜底：个别 GPU/驱动状态下 ready-to-show 不触发，8 秒后强制显示
  setTimeout(() => {
    if (petWindow && !petWindow.isVisible()) {
      dlog('pet show fallback (8s, ready-to-show 未触发)');
      petWindow.showInactive();
    }
  }, 8000);
  await petWindow.loadURL(getUiUrl('desktop-pet'));
  petWindow.on('closed', () => { petWindow = null; });
}

// 桌宠窗口控制：渲染进程拖拽移动 + 悬停暂停点击穿透
ipcMain.on('pet:move-by', (event, dx: number, dy: number) => {
  if (!petWindow || event.sender !== petWindow.webContents || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(x + Math.round(dx), y + Math.round(dy));
});

ipcMain.on('pet:resize', (event, width: number, height: number) => {
  if (!petWindow || typeof width !== 'number' || typeof height !== 'number') return;
  if (width < 400 || width > 1200) return;
  // Windows 上 resizable:false 时 setSize 会被忽略，需临时开启
  petWindow.setResizable(true);
  petWindow.setSize(Math.round(width), Math.round(height));
  petWindow.setResizable(false);
});

ipcMain.on('pet:vision-state', (event, on: boolean) => {
  if (!petWindow || event.sender !== petWindow.webContents || typeof on !== 'boolean') return;
  petVisionOn = on;
});

function showPetContextMenu(): void {
  if (!petWindow) return;
  const menu = Menu.buildFromTemplate([
    {
      label: petVisionOn ? '视觉观察：已开启（点击关闭）' : '视觉观察：已关闭（点击开启）',
      click: () => petWindow?.webContents.send('pet:vision-toggle'),
    },
    { type: 'separator' },
    {
      label: '悬浮于桌面',
      type: 'checkbox',
      checked: petFloating,
      click: (item) => {
        petFloating = item.checked;
        if (!petWindow) return;
        petWindow.setAlwaysOnTop(petFloating, 'floating');
        // 悬浮时禁止被截屏；取消悬浮后恢复可截图
        petWindow.setContentProtection(petFloating);
      },
    },
  ]);
  menu.popup({ window: petWindow });
}

ipcMain.on('pet:set-interactive', (event, interactive: boolean) => {
  if (!petWindow || event.sender !== petWindow.webContents || typeof interactive !== 'boolean') return;
  petWindow.setIgnoreMouseEvents(!interactive, { forward: true });
});

// ---- 生命周期 ----
/** 桌宠独立模式：--pet 启动时只开桌宠窗，不开主界面 */
const PET_ONLY = process.argv.includes('--pet');

/** 拉起 Mage-VL 视觉 sidecar（桌宠模式需要屏幕观察；路径由环境变量提供，未配置则跳过） */
let visionProc: ChildProcess | null = null;
let gatewayProc: ChildProcess | null = null;
let petVisionOn = false;   // 视觉观察状态（右键菜单标签用）
let petFloating = true;    // 悬浮置顶（联动截图保护：悬浮时不可被截屏）
/** 桌面端文件日志：双击启动时 stdout 丢失，关键事件落盘便于诊断 */
function dlog(msg: string): void {
  try {
    appendFileSync(join(homedir(), '.arrodes-desktop.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* 日志失败不影响运行 */ }
}

/** WorkBuddy 远程控制网关：Arrodes 启动时确保在线（detached 独立进程，Arrodes 退出不影响） */
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

function startVisionSidecar(): void {
  const python = process.env.ARRODES_MAGEVL_PYTHON;
  const script = join(__dirname, '../vision-sidecar/mage_vl_sidecar.py');
  if (!python || !existsSync(script)) {
    console.log('[Desktop] 未配置 ARRODES_MAGEVL_PYTHON，跳过视觉 sidecar（屏幕观察将不可用）');
    return;
  }
  visionProc = spawn(python, [script], {
    env: {
      ...process.env,
      HF_HOME: process.env.ARRODES_HF_HOME || process.env.HF_HOME || '',
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const proc = visionProc;
  proc.stdout?.on('data', (d: Buffer) => console.log('[Mage-VL]', d.toString().trim()));
  proc.stderr?.on('data', (d: Buffer) => console.log('[Mage-VL]', d.toString().trim()));
  proc.on('exit', (code) => {
    console.log(`[Desktop] 视觉 sidecar 退出（${String(code)}）`);
    if (visionProc === proc) visionProc = null;
  });
}

function stopVisionSidecar(): void {
  if (visionProc) {
    try { visionProc.kill(); } catch { /* ignore */ }
    visionProc = null;
  }
}

// 单实例锁：重复启动时聚焦已有窗口，而不是报"端口被占"的启动错误
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    } else if (petWindow) {
      petWindow.focus();
    }
  });

  app.on('render-process-gone', (_e, wc, details) => {
  dlog(`render-process-gone: reason=${details.reason} exit=${details.exitCode}`);
});

app.whenReady().then(async () => {
  try {
    await ensureGateway();
    await startBackend();
    if (PET_ONLY) {
      // 桌宠模式：视觉 sidecar + 透明桌宠窗，不开主界面
      startVisionSidecar();
      await createPetWindow();
      return;
    }
    await createWindow();
    await createPetWindow();
  } catch (err) {
    dlog(`STARTUP FAILED: ${String(err)}`);
    console.error('[Desktop] 启动失败:', err);
    // 清理可能残留的后端子进程
    quitting = true;
    if (backendProc) {
      try { backendProc.kill(); } catch { /* ignore */ }
    }
    if (PET_ONLY) {
      // 桌宠模式失败也保持安静退出（避免误弹错误主窗）
      app.quit();
      return;
    }
    // 失败也开窗口显示错误信息，避免"双击没反应"
    mainWindow = new BrowserWindow({ width: 800, height: 500, title: '阿罗德斯 - 启动错误' });
    mainWindow.loadURL(`data:text/html,<h2 style="font-family:sans-serif;color:#e74c3c">启动失败</h2><pre style="font-family:monospace;color:#888">${encodeURIComponent(String(err))}</pre>`);
  }

  app.on('activate', () => {
    if (!mainWindow && !PET_ONLY) void createWindow();
    if (!petWindow) void createPetWindow();
  });
});

}

app.on('window-all-closed', () => {
  // 停后端与视觉 sidecar 再退出
  quitting = true;
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
  stopVisionSidecar();
  app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
  stopVisionSidecar();
});
