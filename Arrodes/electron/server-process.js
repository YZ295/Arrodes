'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

// SIGTERM 宽限时间，超时未退则 SIGKILL
const SIGTERM_GRACE_MS = 3000;

// 以纯 Node 模式 spawn server 的 ESM 入口：
// - 入口为 serverDir/dist/index.js 绝对路径
// - 复用 process.execPath（Electron 下即 electron.exe）并加 ELECTRON_RUN_AS_NODE=1，
//   使子进程不经过 Electron 模块系统，原生加载 ESM
// - cwd 固定为 server 目录，DB_PATH 显式传绝对路径，避免相对路径漂移
// - 必须用 spawn 而非 fork：fork 携带 IPC 通道，在 Electron 环境 loader 初始化路径有兼容问题
function spawnServer(serverDir, port, dbPath) {
  const entry = path.join(serverDir, 'dist', 'index.js');
  const child = spawn(process.execPath, [entry], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      NODE_ENV: 'production',
      DB_PATH: dbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[server] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));
  return child;
}

// 幂等终止：已退出（exitCode/signalCode 非空）或已 kill 则直接返回 false。
// 先 SIGTERM，宽限 SIGTERM_GRACE_MS 后仍存活再 SIGKILL。
function killServer(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return false;
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* 进程已退出则忽略 */
    }
  }, SIGTERM_GRACE_MS);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    proc.kill('SIGTERM');
  } catch {
    /* 进程已退出则忽略 */
  }
  return true;
}

module.exports = { spawnServer, killServer };
