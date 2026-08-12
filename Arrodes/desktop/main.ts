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
import { app, BrowserWindow, shell, dialog } from 'electron';
import { fork, ChildProcess } from 'node:child_process';
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
/** 主动退出标记：置位后后端退出不再弹"意外退出"提示 */
let quitting = false;

/** 定位后端入口 JS */
function findBackendEntry(): string | null {
  // 打包后：resources/server/dist/index.js（extraResources 拷贝）
  // 开发时：desktop/../server/dist/index.js
  const candidates = [
    resolve(__dirname, '../server/dist/index.js'),           // dev
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
    if (!quitting && mainWindow) {
      dialog.showErrorBox('阿罗德斯 - 后端已退出', `后端服务意外退出（code=${code ?? 'unknown'}）。应用即将关闭。`);
      app.quit();
    }
  });

  // REQ-003：/api/health 返回 200 才开窗
  await waitForHealth(PORT);
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

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ---- 生命周期 ----
app.whenReady().then(async () => {
  try {
    await startBackend();
    await createWindow();
  } catch (err) {
    console.error('[Desktop] 启动失败:', err);
    // 清理可能残留的后端子进程
    quitting = true;
    if (backendProc) {
      try { backendProc.kill(); } catch { /* ignore */ }
    }
    // 失败也开窗口显示错误信息，避免"双击没反应"
    mainWindow = new BrowserWindow({ width: 800, height: 500, title: '阿罗德斯 - 启动错误' });
    mainWindow.loadURL(`data:text/html,<h2 style="font-family:sans-serif;color:#e74c3c">启动失败</h2><pre style="font-family:monospace;color:#888">${encodeURIComponent(String(err))}</pre>`);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 停后端再退出
  quitting = true;
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
  app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
});
