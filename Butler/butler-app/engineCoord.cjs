// 引擎跨实例协调（纯 Node 模块，与主应用 server/src/services/butlerService.ts、butler.py 约定一致）
// 约定：数据目录/_butler/ 下
//  - engine.json：活引擎标识 {pid, started_at, data_dir}，引擎启动写、退出删
//  - stop.flag：  优雅停止信号，引擎主循环每秒检查后退出并删除
//  - state.json： 引擎汇总进度心跳（30s）；无 engine.json 但心跳新鲜 → 外部旧版实例
const fs = require('fs');
const path = require('path');

function isPidAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function readEngineInfo(dataDir) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dataDir, '_butler', 'engine.json'), 'utf-8'));
    return typeof d.pid === 'number' ? d : null;
  } catch {
    return null;
  }
}

function readState(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, '_butler', 'state.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function stateFresh(state, staleMs = 120000) {
  if (!state || !state.updated_at) return false;
  const t = Date.parse(state.updated_at);
  return !Number.isNaN(t) && Date.now() - t <= staleMs;
}

/**
 * 引擎状态（供启动前协调 / UI 展示）。
 * @param {string} dataDir 数据目录
 * @param {import('child_process').ChildProcess|null} managedProc 本应用启动的引擎子进程（可为 null）
 */
function engineStatus(dataDir, managedProc) {
  const info = readEngineInfo(dataDir);
  if (info && isPidAlive(info.pid)) {
    const managed = !!managedProc && managedProc.pid === info.pid && managedProc.exitCode === null;
    return { running: true, pid: info.pid, legacy: false, managed, startedAt: info.started_at || null };
  }
  if (!info && stateFresh(readState(dataDir))) {
    return { running: true, pid: null, legacy: true, managed: false, startedAt: null };
  }
  return { running: false, pid: null, legacy: false, managed: false, startedAt: null };
}

/** 请求优雅停止：写 stop.flag（引擎主循环 1 秒内响应） */
function requestStop(dataDir) {
  const dir = path.join(dataDir, '_butler');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'stop.flag'), new Date().toISOString(), 'utf-8');
}

/** 等待 pid 退出（200ms 轮询），超时返回 false */
async function waitPidExit(pid, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return !isPidAlive(pid);
}

module.exports = { isPidAlive, readEngineInfo, readState, stateFresh, engineStatus, requestStop, waitPidExit };
