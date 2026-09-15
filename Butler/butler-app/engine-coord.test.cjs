// 引擎协调模块兼容性验证（纯 node 运行：node engine-coord.test.cjs）
// 验证：独立控制台与主应用共用 engine.json/stop.flag 约定——
//  - 主应用（外部实例）已启动引擎时，控制台的启动协调判定"拒绝启动"
//  - 控制台可对任意实例发起优雅停止（stop.flag）
//  - 陈旧 engine.json / 陈旧 state.json 不会误判运行中
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { engineStatus, requestStop, waitPidExit, isPidAlive } = require('./engineCoord.cjs');

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'butler-app-coord-'));
  const butlerDir = path.join(dataDir, '_butler');
  fs.mkdirSync(butlerDir, { recursive: true });
  const engineFile = path.join(butlerDir, 'engine.json');

  // 1) 无任何状态 → 未运行
  assert.strictEqual(engineStatus(dataDir, null).running, false, '空目录应判未运行');

  // 2) 模拟主应用启动的引擎：engine.json 指向活进程（替身进程）
  const stub = spawn(process.execPath, ['-e', `
    const fs = require('fs');
    const path = require('path');
    const dataDir = process.argv[1];
    const flag = path.join(dataDir, '_butler', 'stop.flag');
    setInterval(() => {
      if (fs.existsSync(flag)) {
        try { fs.unlinkSync(flag); } catch {}
        try { fs.rmSync(path.join(dataDir, '_butler', 'engine.json'), { force: true }); } catch {}
        process.exit(0);
      }
    }, 100);
  `, dataDir], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 300));
  fs.writeFileSync(engineFile, JSON.stringify({ pid: stub.pid, started_at: new Date().toISOString() }));

  // 控制台视角（managedProc=null）：外部实例在运行 → 启动协调应拒绝
  let st = engineStatus(dataDir, null);
  assert.strictEqual(st.running, true, '外部活引擎应判运行中');
  assert.strictEqual(st.managed, false, '外部引擎不应算本应用托管');
  assert.strictEqual(st.legacy, false, '有 PID 文件不算旧版实例');

  // 3) 控制台对"外部实例"发起优雅停止（模拟其 butler:stop 处理器逻辑）
  requestStop(dataDir);
  const dead = await waitPidExit(stub.pid, 8000);
  assert.strictEqual(dead, true, 'stop.flag 应让外部替身引擎退出');
  assert.strictEqual(isPidAlive(stub.pid), false, '替身进程应已死亡');

  // 4) 陈旧 state.json（心跳过期）→ 不误判旧版实例运行中
  fs.rmSync(engineFile, { force: true });
  fs.writeFileSync(path.join(butlerDir, 'state.json'), JSON.stringify({
    summarizing: true, current: null, queue: 4, updated_at: '2026-09-08T21:48:56+08:00',
  }));
  st = engineStatus(dataDir, null);
  assert.strictEqual(st.running, false, '陈旧 state.json 不应判运行中');

  // 5) 新鲜 state.json 且无 engine.json → 外部旧版实例（只读）
  fs.writeFileSync(path.join(butlerDir, 'state.json'), JSON.stringify({
    summarizing: true, current: null, queue: 1, updated_at: new Date().toISOString(),
  }));
  st = engineStatus(dataDir, null);
  assert.strictEqual(st.running, true, '新鲜心跳应判运行中');
  assert.strictEqual(st.legacy, true, '无 PID 文件应判旧版实例');

  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('engine-coord 兼容性验证：全部通过（5/5）');
}

main().catch((e) => { console.error('验证失败：', e); process.exit(1); });
