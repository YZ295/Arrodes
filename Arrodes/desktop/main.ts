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
import { app, BrowserWindow, shell } from 'electron';
import { fork, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = dirname(fileURLToPath(import.meta.url));
// 资源根：dev = desktop/..；prod = resources/app.asar（窗口图标等资源）
const ROOT = resolve(__dirname, '..');
const PORT = Number(process.env.ARRODES_PORT || 3002);

let backendProc: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

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

/** 等端口就绪 */
function waitForPort(port: number, timeoutMs = 30000): Promise<void> {
  return new Promise((resolveOk, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const sock = net.connect({ port, host: '127.0.0.1' });
      sock.once('connect', () => { sock.destroy(); resolveOk(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) reject(new Error(`端口 ${port} 就绪超时`));
        else setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

/** 启动后端子进程 */
async function startBackend(): Promise<void> {
  const entry = findBackendEntry();
  if (!entry) {
    console.error('[Desktop] 找不到后端入口 server/dist/index.js');
    throw new Error('后端入口缺失');
  }

  // fork 子进程跑后端；NODE_ENV=production 触发静态托管 client/dist
  // ELECTRON_RUN_AS_NODE=1：让 electron.exe 以纯 Node 模式运行后端（否则会再开一个 Electron）
  // 关键：清空 NODE_OPTIONS——宿主环境（如 WorkBuddy）注入的 --require/--use-system-ca
  //       会被 Electron 的 Node 模式拒绝，导致"启动错误"。
  backendProc = fork(entry, [], {
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
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
  });

  await waitForPort(PORT);
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
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
  app.quit();
});

app.on('before-quit', () => {
  if (backendProc) {
    try { backendProc.kill(); } catch { /* ignore */ }
  }
});
