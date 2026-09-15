/**
 * Butler 桥接服务行为测试（真实子进程协调，非 mock 引擎）
 *
 * 覆盖：数据读取/日期边界/空目录/损坏数据/状态过期/重复启动协调/
 *       真实启停与恢复/子进程错误。
 */
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createButlerService, type ButlerService } from './butlerService.js';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-butler-test-'));

function tmpDir(name: string): string {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 测试替身引擎：写 engine.json、周期追加真实记录、监听 stop.flag 优雅退出 */
const STUB_ENGINE = `
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const dataDir = val('--data-dir');
const bDir = path.join(dataDir, '_butler');
fs.mkdirSync(bDir, { recursive: true });
fs.rmSync(path.join(bDir, 'stop.flag'), { force: true });
const engineFile = path.join(bDir, 'engine.json');
fs.writeFileSync(engineFile, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), data_dir: dataDir }));
const stateFile = path.join(bDir, 'state.json');
const now = new Date();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const ymd = String(now.getFullYear()) + mm + dd;
const month = now.getFullYear() + '-' + mm;
const monthDir = path.join(dataDir, month);
fs.mkdirSync(monthDir, { recursive: true });
const hourFile = path.join(monthDir, ymd + '_' + String(now.getHours()).padStart(2, '0') + '.json');
const tick = () => {
  try {
    let data;
    try { data = JSON.parse(fs.readFileSync(hourFile, 'utf-8')); } catch { data = { records: [] }; }
    data.records.push({ ts: new Date().toISOString(), image: null, status: 'raw' });
    fs.writeFileSync(hourFile, JSON.stringify(data));
    fs.writeFileSync(stateFile, JSON.stringify({ summarizing: false, current: null, queue: 0, updated_at: new Date().toISOString() }));
  } catch (e) { console.error('stub tick failed', e); }
};
setInterval(tick, 250);
const stopFlag = path.join(bDir, 'stop.flag');
setInterval(() => {
  if (fs.existsSync(stopFlag)) {
    try { fs.unlinkSync(stopFlag); } catch {}
    try { fs.rmSync(engineFile, { force: true }); } catch {}
    process.exit(0);
  }
}, 100);
console.log('stub engine pid=' + process.pid);
`;
const stubEnginePath = path.join(tmpRoot, 'stub-engine.cjs');
fs.writeFileSync(stubEnginePath, STUB_ENGINE);

/** 立即失败退出的脚本（模拟启动失败） */
const crashScript = path.join(tmpRoot, 'crash-engine.cjs');
fs.writeFileSync(crashScript, "console.error('boom: engine crashed'); process.exit(1);");
/** 挂住不写 engine.json 的脚本（模拟启动超时） */
const hangScript = path.join(tmpRoot, 'hang-engine.cjs');
fs.writeFileSync(hangScript, 'setInterval(() => {}, 1000);');

function writeJson(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

function stubService(dataDir: string, extra: Record<string, unknown> = {}): ButlerService {
  return createButlerService({
    dataDir,
    pythonPath: process.execPath,
    scriptPath: stubEnginePath,
    intervalSec: 1,
    sidecarUrl: 'http://127.0.0.1:1',
    startTimeoutMs: 4000,
    stopTimeoutMs: 4000,
    ...extra,
  });
}

async function until(cond: () => boolean, timeoutMs = 8000, stepMs = 150): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error('until() 超时');
}

const spawned: ChildProcess[] = [];
const services: ButlerService[] = [];
afterAll(() => {
  for (const s of services) s.dispose();
  for (const p of spawned) {
    try { p.kill(); } catch { /* ignore */ }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/** 生成一个已死进程的 pid */
async function deadPid(): Promise<number> {
  const p = spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
  await new Promise((r) => p.on('exit', r));
  return p.pid ?? -1;
}

beforeEach(() => {
  // 隔离每个用例的数据目录
});

describe('butlerService 数据读取（只读）', () => {
  it('读取按日 10 分钟段汇总与汇总日期列表', () => {
    const dir = tmpDir('data-read');
    writeJson(path.join(dir, '2026-09', 'summaries', '20260908.json'), {
      date: '2026-09-08',
      segments: [
        { idx: 108, start: '18:00', end: '18:10', status: 'done', project: '写管家集成', category: '工作', samples: 12 },
        { idx: 109, start: '18:10', end: '18:20', status: 'done', project: '休息', category: '娱乐', edited: true, samples: 3 },
      ],
    });
    const svc = stubService(dir);
    expect(svc.summaryDates()).toEqual(['20260908']);
    const day = svc.summaryDay('20260908');
    expect(day.segments).toHaveLength(2);
    expect(day.segments[0].project).toBe('写管家集成');
    // 人工修正标记保留透传（edited 段）
    expect(day.segments[1].edited).toBe(true);
  });

  it('日期参数非法 / 路径穿越时返回空段且不抛错', () => {
    const dir = tmpDir('data-invalid');
    const svc = stubService(dir);
    expect(svc.summaryDay('20260908').segments).toEqual([]);
    expect(svc.summaryDay('not-a-date').segments).toEqual([]);
    expect(svc.summaryDay('../../etc/passwd').segments).toEqual([]);
    expect(svc.summaryDay('').segments).toEqual([]);
  });

  it('月份边界：跨月文件按正确目录读取', () => {
    const dir = tmpDir('data-month-boundary');
    writeJson(path.join(dir, '2026-09', 'summaries', '20260901.json'), {
      date: '2026-09-01', segments: [{ idx: 0, start: '00:00', end: '00:10', status: 'done', project: 'A', category: '工作' }],
    });
    writeJson(path.join(dir, '2026-10', 'summaries', '20261001.json'), {
      date: '2026-10-01', segments: [{ idx: 0, start: '00:00', end: '00:10', status: 'done', project: 'B', category: '工作' }],
    });
    const svc = stubService(dir);
    expect(svc.summaryDates()).toEqual(['20261001', '20260901']);
    expect(svc.summaryDay('20260901').segments[0].project).toBe('A');
    expect(svc.summaryDay('20261001').segments[0].project).toBe('B');
  });

  it('空数据目录：各读取接口返回空而不抛错', () => {
    const dir = tmpDir('data-empty');
    const svc = stubService(dir);
    expect(svc.recentRecords()).toEqual([]);
    expect(svc.summaryDates()).toEqual([]);
    expect(svc.summaryDay('20260908').segments).toEqual([]);
    const st = svc.getStatus();
    expect(st.engine.running).toBe(false);
    expect(st.state.summarizing).toBe(false);
    expect(st.state.stale).toBe(true);
  });

  it('损坏的 JSON 文件被跳过，不影响其他数据', () => {
    const dir = tmpDir('data-corrupt');
    writeJson(path.join(dir, '2026-09', 'summaries', '20260907.json'), { date: '2026-09-07', segments: [] });
    fs.mkdirSync(path.join(dir, '2026-09', 'summaries'), { recursive: true });
    fs.writeFileSync(path.join(dir, '2026-09', 'summaries', '20260908.json'), '{corrupted!!!');
    const svc = stubService(dir);
    expect(svc.summaryDates()).toEqual(['20260908', '20260907']); // 文件在，但内容损坏
    expect(svc.summaryDay('20260908').segments).toEqual([]);      // 损坏 → 空段
    expect(svc.summaryDay('20260907').segments).toEqual([]);
    // 损坏的小时文件不致命
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const ymd = String(now.getFullYear()) + mm + String(now.getDate()).padStart(2, '0');
    fs.mkdirSync(path.join(dir, `${now.getFullYear()}-${mm}`), { recursive: true });
    fs.writeFileSync(path.join(dir, `${now.getFullYear()}-${mm}`, `${ymd}_${String(now.getHours()).padStart(2, '0')}.json`), 'not json');
    expect(() => svc.recentRecords()).not.toThrow();
  });

  it('最近记录按时间倒序、只取最近小时文件', () => {
    const dir = tmpDir('data-records');
    const rec = (ts: string) => ({ ts, image: null, status: 'raw' });
    writeJson(path.join(dir, '2026-09', '20260907_10.json'), { records: [rec('2026-09-07T10:00:00+08:00')] });
    writeJson(path.join(dir, '2026-09', '20260907_23.json'), { records: [rec('2026-09-07T23:00:00+08:00')] });
    const svc = stubService(dir);
    const rs = svc.recentRecords();
    expect(rs.length).toBeGreaterThan(0);
    expect(rs[0].ts).toBe('2026-09-07T23:00:00+08:00');
    for (const r of rs) {
      expect(typeof r.ts).toBe('string');
      expect(['raw', 'unchanged']).toContain(r.status);
    }
  });
});

describe('butlerService 状态：陈旧 state 与活进程区分', () => {
  it('engine.json 指向死进程 → 未运行；state.json 过期 → stale', async () => {
    const dir = tmpDir('st-dead');
    const pid = await deadPid();
    writeJson(path.join(dir, '_butler', 'engine.json'), { pid, started_at: '2026-09-08T20:00:00+08:00' });
    writeJson(path.join(dir, '_butler', 'state.json'), {
      summarizing: true, current: { date: '20260908', start: '18:00', end: '18:10' },
      queue: 4, updated_at: '2026-09-08T21:48:56+08:00', // 早已过期
    });
    const svc = stubService(dir);
    const st = svc.getStatus();
    expect(st.engine.running).toBe(false);           // 陈旧 engine.json 不算运行
    expect(st.state.summarizing).toBe(true);
    expect(st.state.stale).toBe(true);               // 但状态本身陈旧 → UI 显示异常
  });

  it('engine.json 指向活进程（外部实例）→ 运行中、非本应用托管', () => {
    const dir = tmpDir('st-alive-external');
    writeJson(path.join(dir, '_butler', 'engine.json'), { pid: process.pid, started_at: new Date().toISOString() });
    const svc = stubService(dir);
    const st = svc.getStatus();
    expect(st.engine.running).toBe(true);
    expect(st.engine.source).toBe('external');
    expect(st.engine.managed).toBe(false);
  });

  it('无 engine.json 但 state.json 新鲜 → 判定外部旧版实例（可读不可停）', () => {
    const dir = tmpDir('st-legacy');
    writeJson(path.join(dir, '_butler', 'state.json'), {
      summarizing: true, current: null, queue: 1, updated_at: new Date().toISOString(),
    });
    const svc = stubService(dir);
    const st = svc.getStatus();
    expect(st.engine.running).toBe(true);
    expect(st.engine.source).toBe('external-legacy');
    expect(st.state.stale).toBe(false);
  });

  it('无 engine.json 且 state.json 过期 → 未运行（当前真实环境形态）', () => {
    const dir = tmpDir('st-none');
    writeJson(path.join(dir, '_butler', 'state.json'), {
      summarizing: true, current: null, queue: 4, updated_at: '2026-09-08T21:48:56+08:00',
    });
    const svc = stubService(dir);
    expect(svc.getStatus().engine.running).toBe(false);
  });
});

describe('butlerService 启动协调（不能仅靠 Node child 引用）', () => {
  it('外部活引擎存在时 start 拒绝且不 spawn（engine.json 不被覆盖）', async () => {
    const dir = tmpDir('coord-dup');
    const engineFile = path.join(dir, '_butler', 'engine.json');
    writeJson(engineFile, { pid: process.pid, started_at: new Date().toISOString() });
    const svc = stubService(dir);
    const r = await svc.start();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ALREADY_RUNNING');
    // 未被 spawn 覆盖：仍是本测试进程 pid
    expect(JSON.parse(fs.readFileSync(engineFile, 'utf-8')).pid).toBe(process.pid);
  });

  it('外部旧版实例（state 新鲜、无 engine.json）时 start 同样拒绝', async () => {
    const dir = tmpDir('coord-legacy');
    writeJson(path.join(dir, '_butler', 'state.json'), {
      summarizing: true, current: null, queue: 1, updated_at: new Date().toISOString(),
    });
    const svc = stubService(dir);
    const r = await svc.start();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('ALREADY_RUNNING');
    // 未 spawn：仍无 engine.json
    expect(fs.existsSync(path.join(dir, '_butler', 'engine.json'))).toBe(false);
  });

  it('解释器不存在 → 明确失败（PYTHON_MISSING），不误报成功', async () => {
    const dir = tmpDir('coord-nopython');
    const svc = stubService(dir, { pythonPath: path.join(tmpRoot, 'no-such-python.exe') });
    const r = await svc.start();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('PYTHON_MISSING');
  });

  it('引擎脚本不存在 → SCRIPT_MISSING', async () => {
    const dir = tmpDir('coord-noscript');
    const svc = stubService(dir, { scriptPath: path.join(tmpRoot, 'no-such-butler.py') });
    const r = await svc.start();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SCRIPT_MISSING');
  });

  it('子进程立即崩溃 → START_FAILED 且包含 stderr 线索', async () => {
    const dir = tmpDir('coord-crash');
    const svc = stubService(dir, { scriptPath: crashScript });
    const r = await svc.start();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('START_FAILED');
      expect(String(r.detail)).toContain('boom');
    }
    expect(svc.getStatus().engine.running).toBe(false);
  });

  it('子进程挂住不写 engine.json → 启动超时失败且子进程被回收', async () => {
    const dir = tmpDir('coord-hang');
    const svc = stubService(dir, { scriptPath: hangScript, startTimeoutMs: 1500 });
    const r = await svc.start();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('START_TIMEOUT');
    svc.dispose(); // 确保挂住子进程被杀
    await new Promise((res) => setTimeout(res, 300));
    expect(svc.getStatus().engine.running).toBe(false);
  });
});

describe('butlerService 真实启停与恢复（真实子进程）', () => {
  it('start → 有新记录 → stop → 不再新增 → start → 又有记录', async () => {
    const dir = tmpDir('e2e-stub');
    const svc = stubService(dir);
    services.push(svc);

    // 未运行时 stop → NOT_RUNNING
    const stop0 = await svc.stop();
    expect(stop0.ok).toBe(false);
    if (!stop0.ok) expect(stop0.code).toBe('NOT_RUNNING');

    // 启动
    const r1 = await svc.start();
    expect(r1.ok).toBe(true);
    const st1 = svc.getStatus();
    expect(st1.engine.running).toBe(true);
    expect(st1.engine.source).toBe('managed');
    expect(st1.engine.managed).toBe(true);
    expect(st1.engine.pid).toBeTruthy();

    // 有新记录
    await until(() => svc.recentRecords().length > 0);
    const count1 = svc.recentRecords().length;

    // 停止（真实停止截图 = 引擎进程退出）
    const s1 = await svc.stop();
    expect(s1.ok).toBe(true);
    const st2 = svc.getStatus();
    expect(st2.engine.running).toBe(false);
    expect(st2.engine.pid).toBeNull();

    // 停止后不再新增
    await new Promise((res) => setTimeout(res, 1200));
    const count2 = svc.recentRecords().length;
    expect(count2).toBe(count1);

    // 再次启动 → 同一数据目录继续，又有新记录
    const r2 = await svc.start();
    expect(r2.ok).toBe(true);
    await until(() => svc.recentRecords().length > count2, 8000);
  }, 30000);

  it('stop 外部旧版实例（无 engine.json、state 新鲜）→ 明确失败而不是误停', async () => {
    const dir = tmpDir('stop-legacy');
    writeJson(path.join(dir, '_butler', 'state.json'), {
      summarizing: true, current: null, queue: 1, updated_at: new Date().toISOString(),
    });
    const svc = stubService(dir);
    const r = await svc.stop();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('EXTERNAL_LEGACY');
  });
});
