'use strict';

const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');
const { isPortInUse, getPidByPort } = require('./port-check');
const { spawnServer, killServer } = require('./server-process');
const { waitForHealth } = require('./health');

const SERVER_DIR = path.resolve(__dirname, '..', 'server');
const PORT = 3002;
const HOST = '127.0.0.1';
const HEALTH_URL = `http://${HOST}:${PORT}/api/health`;
const APP_URL = `http://localhost:${PORT}`;
const HEALTH_INTERVAL = 200;
const HEALTH_TIMEOUT = 10000;

let serverProc = null;
// 主动停止标志：置位后子进程 exit 视为预期，不弹窗
let serverStopping = false;
let fatalShown = false;

function fatal(title, message) {
  if (fatalShown) return;
  fatalShown = true;
  dialog.showErrorBox(title, message);
  app.quit();
}

function shutdownServer() {
  serverStopping = true;
  killServer(serverProc);
}

async function main() {
  // 1. 端口预检：被占则弹窗（附真实 PID）退出，绝不继续 spawn
  if (await isPortInUse(HOST, PORT)) {
    const pid = await getPidByPort(PORT);
    console.log(`[Arrodes] 端口 ${PORT} 已被占用，占用进程 PID=${pid || '未知'}`);
    fatal(
      '端口 3002 已被占用',
      `端口 ${PORT} 正被${pid ? ` PID ${pid}` : '另一进程'}占用，无法启动内置服务。\n\n` +
        (pid
          ? `请先结束该进程（任务管理器，或 taskkill /PID ${pid} /F），再重新启动 Arrodes。`
          : '请先关闭占用该端口的程序，再重新启动 Arrodes。')
    );
    return;
  }

  // 2. spawn server：DB_PATH 一律转绝对路径，防止 cwd 漂移写错数据库位置
  const dbPath = process.env.DB_PATH
    ? path.resolve(SERVER_DIR, process.env.DB_PATH)
    : path.resolve(SERVER_DIR, 'data');
  serverProc = spawnServer(SERVER_DIR, PORT, dbPath);
  serverProc.on('exit', (code, signal) => {
    if (!serverStopping && !fatalShown) {
      fatal(
        '内置服务意外退出',
        `服务进程已退出（code=${code}，signal=${signal}）。\n\n应用即将退出。`
      );
    }
  });

  // 3. health 轮询：返回 200 才开窗；超时终止子进程并退出
  try {
    await waitForHealth(HEALTH_URL, {
      interval: HEALTH_INTERVAL,
      timeout: HEALTH_TIMEOUT,
    });
  } catch (err) {
    shutdownServer();
    fatal('内置服务启动失败', `${err.message}\n\n服务进程已终止，应用即将退出。`);
    return;
  }
  createWindow();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Arrodes',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    if (!fatalShown) {
      fatal('页面加载失败', `无法加载 ${APP_URL}（${code} ${description}）。`);
    }
  });
  win.loadURL(APP_URL);
}

app.whenReady().then(main);

// 所有窗口关闭 → 回收子进程 → 退出
app.on('window-all-closed', () => {
  shutdownServer();
  app.quit();
});

// 兜底：任何退出路径都先回收子进程（killServer 幂等，防残留）
app.on('before-quit', () => {
  shutdownServer();
});

// macOS 惯例：Dock 点击重新开窗（server 仍在运行则直接开）
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverProc) {
    createWindow();
  }
});
