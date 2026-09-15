/**
 * 阿罗德斯管家桥接服务
 *
 * 职责（薄桥接，不复制引擎逻辑）：
 *  - 截图采集引擎（butler.py）的进程协调：启动 / 停止 / 状态
 *  - 引擎落盘数据（TheFool 数据目录）的只读读取：最近记录 / 按日 10 分钟段汇总
 *
 * 跨实例协调约定（与 butler.py / butler-app 一致，数据目录内）：
 *  - `_butler/engine.json`：常驻引擎启动时写入 {pid, started_at, data_dir}，退出时删除。
 *    任何 UI 判断"是否已有引擎"都以此文件 + PID 活性为准，而不是各自进程内的 child 引用，
 *    避免主应用与独立控制台重复启动两个引擎。
 *  - `_butler/stop.flag`：停止信号。引擎主循环每秒检查，存在则优雅退出并删除该文件。
 *  - `_butler/state.json`：引擎写的汇总进度（30s 心跳）。无 engine.json 但 state.json 新鲜
 *    → 判定"外部旧版实例"（只读状态，无法安全停止/启动）。
 *
 * 配置（env 可覆盖，默认兼容本机）：
 *  BUTLER_DATA_DIR / BUTLER_PYTHON / BUTLER_SCRIPT / BUTLER_SIDECAR_URL / BUTLER_INTERVAL
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- 类型 ----------

export interface ButlerRecord {
  ts: string;
  status: string;
}

export interface ButlerSegment {
  idx?: number;
  start?: string;
  end?: string;
  status?: string;
  project?: string;
  category?: string;
  summary_line?: string;
  description?: string;
  edited?: boolean;
  samples?: number;
  [key: string]: unknown;
}

export interface ButlerDaySummary {
  date: string;
  segments: ButlerSegment[];
}

export type ButlerEngineSource = 'managed' | 'external' | 'external-legacy' | 'none';

export interface ButlerEngineInfo {
  running: boolean;
  pid: number | null;
  source: ButlerEngineSource;
  managed: boolean;
  startedAt: string | null;
}

export interface ButlerStateInfo {
  summarizing: boolean;
  queue: number;
  current: { date: string; start: string; end: string } | null;
  updatedAt: string | null;
  stale: boolean;
}

export interface ButlerStatus {
  dataDir: string;
  engine: ButlerEngineInfo;
  state: ButlerStateInfo;
}

export type ButlerStartResult =
  | { ok: true; pid: number }
  | {
      ok: false;
      code: 'ALREADY_RUNNING' | 'PYTHON_MISSING' | 'SCRIPT_MISSING' | 'START_FAILED' | 'START_TIMEOUT';
      reason: string;
      detail?: string;
    };

export type ButlerStopResult =
  | { ok: true; pid: number | null }
  | { ok: false; code: 'NOT_RUNNING' | 'EXTERNAL_LEGACY' | 'STOP_FAILED'; reason: string };

export interface ButlerService {
  getStatus(): ButlerStatus;
  start(): Promise<ButlerStartResult>;
  stop(): Promise<ButlerStopResult>;
  recentRecords(limit?: number): ButlerRecord[];
  summaryDates(): string[];
  summaryDay(ymd: string): ButlerDaySummary;
  dispose(): void;
}

export interface ButlerServiceOptions {
  dataDir: string;
  pythonPath: string;
  /** 解释器附加参数（python 用 -u 关闭输出缓冲；测试用 node 替身时传 []） */
  interpreterArgs: string[];
  scriptPath: string;
  intervalSec: number;
  sidecarUrl: string;
  /** engine.json 写入即视为启动成功，超时则失败并回收子进程 */
  startTimeoutMs: number;
  /** stop.flag 写出后等待进程退出的时长 */
  stopTimeoutMs: number;
  /** state.json 心跳超过该时长视为陈旧 */
  stateStaleMs: number;
}

// ---------- 工具 ----------

function isPidAlive(pid: number | null | undefined): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readJsonFile(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// ---------- 工厂 ----------

export function createButlerService(opts: Partial<ButlerServiceOptions> = {}): ButlerService {
  const o: Required<ButlerServiceOptions> = {
    dataDir: opts.dataDir ?? process.env.BUTLER_DATA_DIR ?? 'E:\\project\\HermesProject\\Obsidian\\TheFool',
    pythonPath: opts.pythonPath
      ?? process.env.BUTLER_PYTHON
      ?? 'C:\\Users\\29352\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe',
    interpreterArgs: opts.interpreterArgs ?? (/python(\.exe)?$/i.test(opts.pythonPath ?? process.env.BUTLER_PYTHON ?? 'python.exe') ? ['-u'] : []),
    // src/services 与 dist/services 深度一致：../../.. 均为主应用根（含 butler/）
    scriptPath: opts.scriptPath ?? process.env.BUTLER_SCRIPT ?? resolve(__dirname, '..', '..', '..', 'butler', 'butler.py'),
    intervalSec: opts.intervalSec ?? Number(process.env.BUTLER_INTERVAL || 20),
    sidecarUrl: opts.sidecarUrl ?? process.env.BUTLER_SIDECAR_URL ?? 'http://127.0.0.1:12002',
    startTimeoutMs: opts.startTimeoutMs ?? 15_000,
    stopTimeoutMs: opts.stopTimeoutMs ?? 10_000,
    stateStaleMs: opts.stateStaleMs ?? 120_000,
  };

  const butlerDir = join(o.dataDir, '_butler');
  const engineFile = join(butlerDir, 'engine.json');
  const stateFile = join(butlerDir, 'state.json');
  const stopFlagFile = join(butlerDir, 'stop.flag');

  let managedChild: ChildProcess | null = null;
  /** 本服务最近一次成功启动的引擎真实 pid（engine.json 中的；venv 启动器会再 fork，child.pid 不等于引擎 pid） */
  let managedEnginePid: number | null = null;
  let outputTail = '';
  /** 最近一次由本服务完成的停止时间：区分"我们刚停的残留新鲜 state"与"外部旧版实例" */
  let lastStoppedAt = 0;

  function engineInfo(): { pid: number | null; startedAt: string | null; alive: boolean } {
    const data = readJsonFile(engineFile);
    const pid = typeof data?.pid === 'number' ? data.pid : null;
    const startedAt = typeof data?.started_at === 'string' ? data.started_at : null;
    return { pid, startedAt, alive: isPidAlive(pid) };
  }

  function stateInfo(): ButlerStateInfo {
    const data = readJsonFile(stateFile);
    const updatedAt = typeof data?.updated_at === 'string' ? data.updated_at : null;
    let stale = true;
    if (updatedAt) {
      const t = Date.parse(updatedAt);
      stale = Number.isNaN(t) || Date.now() - t > o.stateStaleMs;
    }
    const cur = data?.current as { date?: string; start?: string; end?: string } | null | undefined;
    return {
      summarizing: data?.summarizing === true,
      queue: typeof data?.queue === 'number' ? data.queue : 0,
      current: cur && cur.date && cur.start && cur.end
        ? { date: String(cur.date), start: String(cur.start), end: String(cur.end) }
        : null,
      updatedAt,
      stale,
    };
  }

  /** 外部旧版实例判定：无 engine.json（或已死）但 state.json 心跳新鲜 */
  function legacyExternalRunning(): boolean {
    const st = stateInfo();
    if (!st.updatedAt || st.stale) return false;
    const t = Date.parse(st.updatedAt);
    // 我们刚停止的引擎留下的新鲜 state 不算外部实例
    if (!Number.isNaN(t) && t <= lastStoppedAt) return false;
    return engineInfo().alive === false;
  }

  function getStatus(): ButlerStatus {
    const eng = engineInfo();
    let engine: ButlerEngineInfo;
    if (eng.alive && eng.pid) {
      const managed = eng.pid === managedEnginePid;
      engine = {
        running: true,
        pid: eng.pid,
        source: managed ? 'managed' : 'external',
        managed,
        startedAt: eng.startedAt,
      };
    } else if (legacyExternalRunning()) {
      engine = { running: true, pid: null, source: 'external-legacy', managed: false, startedAt: null };
    } else {
      engine = { running: false, pid: null, source: 'none', managed: false, startedAt: null };
    }
    return { dataDir: o.dataDir, engine, state: stateInfo() };
  }

  function collectOutput(chunk: Buffer): void {
    outputTail = (outputTail + chunk.toString('utf-8')).slice(-4000);
  }

  async function start(): Promise<ButlerStartResult> {
    // 1) 协调：已有活引擎（本应用或外部实例）→ 拒绝
    const eng = engineInfo();
    if (eng.alive && eng.pid) {
      return {
        ok: false,
        code: 'ALREADY_RUNNING',
        reason: `引擎已在运行（pid ${eng.pid}，${managedChild?.pid === eng.pid ? '本应用' : '外部实例'}启动）`,
      };
    }
    if (legacyExternalRunning()) {
      return {
        ok: false,
        code: 'ALREADY_RUNNING',
        reason: '检测到外部旧版引擎实例在运行（无 PID 文件），请用原控制台或任务管理器停止后再启动',
      };
    }

    // 2) 前置检查：解释器 / 脚本缺失 → 明确失败，绝不误报成功
    if (!existsSync(o.pythonPath)) {
      return { ok: false, code: 'PYTHON_MISSING', reason: `Python 解释器不存在：${o.pythonPath}` };
    }
    if (!existsSync(o.scriptPath)) {
      return { ok: false, code: 'SCRIPT_MISSING', reason: `引擎脚本不存在：${o.scriptPath}` };
    }

    // 3) spawn 并等待 engine.json 出现"新的活 pid"才算成功。
    //    注意：venv 的 python.exe 是启动器，会再 fork 真实解释器，
    //    child.pid 不一定等于 engine.json 里的 pid，因此以 pid 变化为准。
    const pidBefore = engineInfo().pid;
    outputTail = '';
    const child = spawn(o.pythonPath, [
      ...o.interpreterArgs,
      o.scriptPath,
      '--data-dir', o.dataDir,
      '--interval', String(Math.max(5, o.intervalSec)),
      '--sidecar-url', o.sidecarUrl,
    ], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    managedChild = child;
    child.stdout?.on('data', collectOutput);
    child.stderr?.on('data', collectOutput);
    let spawnError = '';
    child.on('error', (e) => { spawnError = String(e); });

    const deadline = Date.now() + o.startTimeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode) {
        managedChild = null;
        return {
          ok: false,
          code: 'START_FAILED',
          reason: `引擎进程启动后立即退出（code ${child.exitCode}）`,
          detail: (spawnError || outputTail).slice(-800),
        };
      }
      const eng2 = engineInfo();
      if (eng2.alive && eng2.pid && eng2.pid !== pidBefore) {
        managedEnginePid = eng2.pid;
        return { ok: true, pid: eng2.pid };
      }
      await sleep(200);
    }
    // 超时：回收子进程树（杀启动器不杀引擎会留下孤儿），避免无人认领的引擎
    if (child.pid) killTree(child.pid);
    managedChild = null;
    return {
      ok: false,
      code: 'START_TIMEOUT',
      reason: `引擎启动超时（${o.startTimeoutMs}ms 内未写入 engine.json）`,
      detail: outputTail.slice(-800),
    };
  }

  async function waitForPidDeath(pid: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isPidAlive(pid)) return true;
      await sleep(200);
    }
    return !isPidAlive(pid);
  }

  /** 强杀进程树：venv 启动器会 fork 真实引擎，杀单个 child 会留孤儿 */
  function killTree(pid: number): void {
    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      } catch { /* ignore */ }
    } else {
      try { process.kill(pid, 'SIGKILL'); } catch { /* ignore */ }
    }
  }

  async function stop(): Promise<ButlerStopResult> {
    // 1) 找停止目标
    const eng = engineInfo();
    let targetPid = eng.alive ? eng.pid : null;
    if (!targetPid && managedChild && managedChild.exitCode === null && isPidAlive(managedChild.pid)) {
      // engine.json 尚未写/已丢但子进程还活着（理论上短暂存在）
      targetPid = managedChild.pid ?? null;
    }
    if (!targetPid) {
      if (legacyExternalRunning()) {
        return {
          ok: false,
          code: 'EXTERNAL_LEGACY',
          reason: '外部旧版引擎实例在运行（无 PID 文件），无法安全停止；请用原控制台停止',
        };
      }
      return { ok: false, code: 'NOT_RUNNING', reason: '引擎未在运行' };
    }

    // 2) 优雅停止：写 stop.flag，引擎主循环每秒检查后退出
    try {
      mkdirSync(butlerDir, { recursive: true });
      writeFileSync(stopFlagFile, new Date().toISOString(), 'utf-8');
    } catch (e) {
      return { ok: false, code: 'STOP_FAILED', reason: `无法写入停止信号：${String(e)}` };
    }

    // 3) 等待退出
    let dead = await waitForPidDeath(targetPid, o.stopTimeoutMs);
    if (!dead) {
      // 兜底强杀进程树（引擎 pid 或启动器 pid 均可，/T 覆盖整棵树）
      killTree(targetPid);
      dead = await waitForPidDeath(targetPid, 5000);
    }

    if (!dead) {
      return { ok: false, code: 'STOP_FAILED', reason: `引擎进程（pid ${targetPid}）未能在超时内退出` };
    }
    lastStoppedAt = Date.now();
    if (managedChild && managedChild.pid !== targetPid) {
      // 引擎 pid 与启动器 pid 不同（venv fork）：一并回收启动器
      if (managedChild.exitCode === null) {
        try { managedChild.kill(); } catch { /* ignore */ }
      }
    }
    managedChild = null;
    if (managedEnginePid === targetPid) managedEnginePid = null;
    // 清理可能残留的信号文件与陈旧 engine.json（引擎正常退出会自删；双保险）
    try { rmSync(stopFlagFile, { force: true }); } catch { /* ignore */ }
    try {
      const e2 = engineInfo();
      if (e2.pid === targetPid && !e2.alive) rmSync(engineFile, { force: true });
    } catch { /* ignore */ }
    return { ok: true, pid: targetPid };
  }

  // ---------- 只读数据访问 ----------

  function recentRecords(limit = 60): ButlerRecord[] {
    const now = new Date();
    const month = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
    const monthDir = join(o.dataDir, month);
    if (!existsSync(monthDir)) return [];
    let files: string[] = [];
    try {
      files = readdirSafe(monthDir).filter((f) => /^\d{8}_\d{2}\.json$/.test(f)).sort().slice(-3);
    } catch {
      return [];
    }
    const records: ButlerRecord[] = [];
    for (const f of files) {
      const data = readJsonFile(join(monthDir, f));
      const rs = Array.isArray(data?.records) ? (data.records as Array<Record<string, unknown>>) : [];
      for (const r of rs) {
        if (typeof r.ts === 'string') {
          records.push({ ts: r.ts, status: typeof r.status === 'string' ? r.status : '' });
        }
      }
    }
    records.sort((a, b) => b.ts.localeCompare(a.ts));
    return records.slice(0, limit);
  }

  function summaryDates(): string[] {
    const out: string[] = [];
    try {
      for (const m of readdirSafe(o.dataDir).filter((x) => /^\d{4}-\d{2}$/.test(x)).sort().reverse()) {
        const dir = join(o.dataDir, m, 'summaries');
        if (!existsSync(dir)) continue;
        for (const f of readdirSafe(dir).filter((x) => /^\d{8}\.json$/.test(x)).sort().reverse()) {
          out.push(f.replace('.json', ''));
        }
      }
    } catch {
      return [];
    }
    return out;
  }

  function summaryDay(ymd: string): ButlerDaySummary {
    const date = String(ymd);
    if (!/^\d{8}$/.test(date)) return { date, segments: [] };
    const month = `${date.slice(0, 4)}-${date.slice(4, 6)}`;
    const file = join(o.dataDir, month, 'summaries', `${date}.json`);
    const data = readJsonFile(file);
    const segments = Array.isArray(data?.segments) ? (data.segments as ButlerSegment[]) : [];
    return { date, segments };
  }

  function readdirSafe(dir: string): string[] {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  }

  function dispose(): void {
    if (managedChild && managedChild.exitCode === null) {
      if (managedChild.pid) killTree(managedChild.pid);
      try { managedChild.kill(); } catch { /* ignore */ }
    }
    if (managedEnginePid && isPidAlive(managedEnginePid)) killTree(managedEnginePid);
    managedChild = null;
    managedEnginePid = null;
  }

  return { getStatus, start, stop, recentRecords, summaryDates, summaryDay, dispose };
}

/** 默认实例（env 配置，供主应用路由挂载） */
export const butlerService = createButlerService();
