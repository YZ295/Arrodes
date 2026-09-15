// 阿罗德斯管家控制台 - Electron 主进程
// 职责：进程管理（butler.py 引擎 / Qwen3-VL 侧车）+ 记录读取；引擎逻辑全部复用 butler.py
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
// 跨实例协调（与主应用同一约定：engine.json + stop.flag，不能只看本进程 child 引用）
const { engineStatus, requestStop, waitPidExit } = require('./engineCoord.cjs');

app.setName('arrodes-butler-console');
app.setPath('userData', require('path').join(app.getPath('appData'), 'arrodes-butler-console'));
const APP_ROOT = __dirname;
const ARRODES_ROOT = path.join(APP_ROOT, '..');
const ENGINE_PY = process.env.BUTLER_PYTHON || path.join(ARRODES_ROOT, 'vision-sidecar', '.venv', 'Scripts', 'python.exe');
const BUTLER_SCRIPT = path.join(ARRODES_ROOT, 'butler', 'butler.py');
const SIDECAR_PY = path.join(ARRODES_ROOT, 'vision-sidecar', '.venv', 'Scripts', 'python.exe');
// Qwen3-VL 侧车（Ollama 后端，qwen3-vl:4b-instruct）；2026-09-09 起为全项目统一视觉引擎
const SIDECAR_SCRIPT = path.join(ARRODES_ROOT, 'vision-sidecar', 'qwen_vl_sidecar.py');
const DATA_DIR = process.env.BUTLER_DATA_DIR || 'E:\\project\\HermesProject\\Obsidian\\TheFool';
const SIDECAR_URL = 'http://127.0.0.1:12012';

let engineProc = null;
let sidecarProc = null;
let engineLog = [];
let sidecarLog = [];
const LOG_MAX = 300;

function pushLog(arr, tag, data) {
  for (const line of String(data).split(/\r?\n/)) {
    if (!line.trim()) continue;
    arr.push(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${tag} ${line}`);
  }
  if (arr.length > LOG_MAX) arr.splice(0, arr.length - LOG_MAX);
}

async function sidecarHealth() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const r = await fetch(SIDECAR_URL + '/health', { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function startEngine() {
  // 跨实例协调：已有活引擎（本应用或主应用/外部启动）→ 拒绝，绝不重复启动
  const st = engineStatus(DATA_DIR, engineProc);
  if (st.running) {
    return {
      ok: false,
      reason: st.managed
        ? '引擎已由本应用启动'
        : st.legacy
          ? '外部旧版引擎实例在运行（无 PID 文件），请先手动停止'
          : `引擎已由外部实例启动（pid ${st.pid}，主应用或另一控制台）`,
    };
  }
  engineLog = [];
  engineProc = spawn(ENGINE_PY, ['-u', BUTLER_SCRIPT], {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      TMP: 'E:\\AI\\tmp', TEMP: 'E:\\AI\\tmp',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const p = engineProc;
  p.stdout?.on('data', (d) => pushLog(engineLog, '引擎', d));
  p.stderr?.on('data', (d) => pushLog(engineLog, '引擎!', d));
  p.on('exit', (code) => {
    pushLog(engineLog, '引擎', code === null ? '进程被终止' : `进程退出（code ${code}）`);
    if (engineProc === p) engineProc = null;
  });
  pushLog(engineLog, '系统', '引擎已启动（butler.py）');
  // 截图联动：引擎（截屏循环）启动成功时同步唤起管家桌宠（可在"管家"标签页关闭）
  if (petAutoLaunch) {
    const r = launchPet('截图联动');
    pushLog(engineLog, '系统', r.ok ? '截图联动：管家桌宠已同步唤起' : `截图联动失败：${r.reason}`);
  }
  return { ok: true };
}

function startSidecar() {
  if (sidecarProc) return { ok: false, reason: '侧车已由本应用启动' };
  sidecarLog = [];
  sidecarProc = spawn(SIDECAR_PY, ['-u', SIDECAR_SCRIPT, '--port', '12012'], {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const p = sidecarProc;
  p.stdout?.on('data', (d) => pushLog(sidecarLog, '侧车', d));
  p.stderr?.on('data', (d) => pushLog(sidecarLog, '侧车!', d));
  p.on('exit', (code) => {
    pushLog(sidecarLog, '侧车', code === null ? '进程被终止' : `进程退出（code ${code}）`);
    if (sidecarProc === p) sidecarProc = null;
  });
  pushLog(sidecarLog, '系统', '侧车已启动（懒加载：首次分析才会加载权重）');
  return { ok: true };
}

function readRecentRecords() {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dir = path.join(DATA_DIR, ym);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d{8}_\d{2}\.json$/.test(f))
    .sort().slice(-3);
  const recs = [];
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      recs.push(...(d.records || []));
    } catch { /* 跳过损坏文件 */ }
  }
  recs.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
  return recs.slice(0, 60);
}

ipcMain.handle('butler:start', () => startEngine());
ipcMain.handle('butler:stop', async () => {
  // 跨实例停止：优先 stop.flag 优雅停止（外部实例同样适用），兜底强杀
  const st = engineStatus(DATA_DIR, engineProc);
  if (st.legacy) {
    return { ok: false, reason: '外部旧版引擎实例在运行（无 PID 文件），无法安全停止' };
  }
  let pid = st.pid;
  if (!pid && engineProc && engineProc.exitCode === null) pid = engineProc.pid;
  if (!pid) return { ok: false, reason: '引擎未在运行' };

  requestStop(DATA_DIR);
  let dead = await waitPidExit(pid);
  if (!dead) {
    if (engineProc && engineProc.pid === pid) {
      engineProc.kill();
    } else {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    dead = await waitPidExit(pid, 5000);
  }
  return dead ? { ok: true } : { ok: false, reason: `引擎进程（pid ${pid}）未能在超时内退出` };
});
ipcMain.handle('butler:status', () => ({
  running: engineStatus(DATA_DIR, engineProc).running,
  log: engineLog.slice(-40),
}));
ipcMain.handle('sidecar:start', async () => {
  const h = await sidecarHealth();
  if (h) return { ok: false, reason: `侧车已在线（${h.status}）` };
  return startSidecar();
});
ipcMain.handle('sidecar:status', async () => {
  const h = await sidecarHealth();
  return { online: !!h, health: h, managed: !!sidecarProc, log: sidecarLog.slice(-40) };
});
ipcMain.handle('records:recent', () => readRecentRecords());

// ---- 动态页：10 分钟段结构化汇总（引擎每 10 分钟写入 summaries/{日期}.json）----
ipcMain.handle('summary:dates', () => {
  const out = [];
  try {
    if (!fs.existsSync(DATA_DIR)) return out;
    for (const m of fs.readdirSync(DATA_DIR).sort().reverse()) {
      const daily = path.join(DATA_DIR, m, 'summaries');
      if (!fs.existsSync(daily)) continue;
      for (const f of fs.readdirSync(daily)
        .filter((f) => /^\d{8}\.json$/.test(f)).sort().reverse()) {
        out.push(f.replace('.json', ''));
      }
    }
  } catch { /* 忽略 */ }
  return out;
});

ipcMain.handle('summary:day', (_e, ymd) => {
  if (!/^\d{8}$/.test(String(ymd))) return { date: ymd, segments: [] };
  const month = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
  const f = path.join(DATA_DIR, month, 'summaries', `${ymd}.json`);
  try {
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {
    return { date: ymd, segments: [] };
  }
});

// 人工修正：模型识别不保证准确，用户在 UI 编辑后写回。
// 首次编辑快照 original（保留 AI 原始判断供对照审核）；引擎读 edited 标记不覆盖人工数据。
const SUMMARY_CATS = ['娱乐', '工作', '学习', '社交', '未分类'];
const EDITABLE_FIELDS = ['project', 'category', 'description', 'software', 'todos', 'summary_line'];

ipcMain.handle('summary:update', (_e, args) => {
  const { ymd, idx, patch } = args || {};
  if (!/^\d{8}$/.test(String(ymd || ''))) return { ok: false, error: '日期格式无效' };
  if (!Number.isInteger(idx)) return { ok: false, error: '段序号无效' };
  if (!patch || typeof patch !== 'object') return { ok: false, error: '缺少修改内容' };

  const month = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
  const f = path.join(DATA_DIR, month, 'summaries', `${ymd}.json`);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {
    return { ok: false, error: '汇总文件不存在或损坏' };
  }
  const seg = (data.segments || []).find((s) => s.idx === idx);
  if (!seg) return { ok: false, error: '未找到该时段' };

  // 分类必须落在枚举内（与引擎 CATEGORIES 对齐）
  if (patch.category !== undefined && !SUMMARY_CATS.includes(patch.category)) {
    return { ok: false, error: `分类必须是：${SUMMARY_CATS.join('/')}` };
  }
  // 数组字段规范化（software: 逗号分隔字符串或数组；todos: 分号分隔字符串或数组）
  const normList = (v, sepRe) => {
    if (v === undefined) return undefined;
    const arr = Array.isArray(v) ? v : String(v).split(sepRe);
    return arr.map((x) => String(x).trim()).filter(Boolean);
  };
  const soft = normList(patch.software, /[,，]/);
  const todos = normList(patch.todos, /[；;]/);
  for (const [k, v] of Object.entries({ software: soft, todos })) {
    if (v === undefined) continue;
    if (v.some((x) => x.length > 100)) return { ok: false, error: `${k} 中有超过 100 字的条目` };
    patch[k] = v;
  }
  for (const k of ['project', 'category', 'description', 'summary_line']) {
    if (patch[k] !== undefined && typeof patch[k] !== 'string') {
      return { ok: false, error: `${k} 必须是文本` };
    }
  }

  // 首次编辑：快照 AI 原始输出（审核对照）
  if (!seg.edited) {
    seg.original = {};
    for (const k of EDITABLE_FIELDS) {
      if (seg[k] !== undefined) seg.original[k] = seg[k];
    }
  }
  let applied = 0;
  for (const k of EDITABLE_FIELDS) {
    if (patch[k] !== undefined) { seg[k] = patch[k]; applied += 1; }
  }
  if (!applied) return { ok: false, error: '没有可应用的修改' };
  seg.edited = true;
  seg.edited_at = new Date().toISOString();

  // 原子写回（tmp + rename，与引擎同策略）
  const tmp = `${f}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf-8');
    fs.renameSync(tmp, f);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* 忽略 */ }
    return { ok: false, error: `写入失败：${String(err).slice(0, 120)}` };
  }
  return { ok: true, seg };
});

// 汇总进度状态（引擎写 _butler/state.json）：{summarizing, current, queue}
ipcMain.handle('butler:state', () => {
  const f = path.join(DATA_DIR, '_butler', 'state.json');
  try {
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {
    return { summarizing: false, current: null, queue: 0 };
  }
});

// ================= 问答（agentic 本地检索） =================
// 64x64 深灰纯色 PNG：sidecar /analyze 强制带图且校验 base64 长度 ≥100，
// 纯文本问答时用它占位（336 字符，模型忽略图像内容）
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAwUlEQVR4nNXOQREAAAyDMKTUv8qJ4MEtCsKeow5Y1AGLOmBRByzqgEUdsKgDFnXAog5Y1AGLOmBRByzqgEUdsKgDFnXAog5Y1AGLOmBRByzqgEUdsKgDFnXAog5Y1AGLOmBRByzqgEUdsKgDFnXAog5Y1AGLOmBRByzqgEUdsKgDFnXAog5Y1AGLOmBRByzqgEUdsKgDFnXAog5Y1AGLOmBRByzqgEUdsKgDFnXAog5Y1AGLOmBRByzqgEUdsKgD1gGr+ABb+i+NZgAAAABJRU5ErkJggg==';
const QA_MAX_ROUNDS = 3;      // agentic 搜索最多 3 轮
const QA_HITS_PER_QUERY = 6;  // 每个查询最多命中段数
const QA_EXCERPT_LEN = 300;   // 每段摘录截断长度

async function sidecarChat(prompt, maxTok, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(SIDECAR_URL + '/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: TINY_PNG_B64, prompt, max_new_tokens: maxTok,
      }),
      signal: ctrl.signal,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`);
    return (d.text || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

function listSummaryFiles() {
  const out = [];
  try {
    for (const m of fs.readdirSync(DATA_DIR).sort()) {
      const dir = path.join(DATA_DIR, m, 'summaries');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((x) => /^\d{8}\.json$/.test(x)).sort()) {
        out.push(f.replace('.json', ''));
      }
    }
  } catch { /* 忽略 */ }
  return out;
}

function loadDaySegments(ymd) {
  const month = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}`;
  const f = path.join(DATA_DIR, month, 'summaries', `${ymd}.json`);
  try {
    return JSON.parse(fs.readFileSync(f, 'utf-8')).segments || [];
  } catch { return []; }
}

function localSearch(q) {
  const hits = [];
  const kws = (q.keywords || []).map((k) => String(k).toLowerCase()).filter(Boolean);
  if (!kws.length) return hits;
  const all = q.date_from === 'all' && q.date_to === 'all';
  for (const ymd of listSummaryFiles()) {
    if (!all) {
      if (q.date_from && ymd < q.date_from) continue;
      if (q.date_to && ymd > q.date_to) continue;
    }
    for (const s of loadDaySegments(ymd)) {
      if (s.status !== 'done') continue;
      const hay = `${s.project}\n${s.category}\n${s.description}\n${(s.software || []).join(',')}`.toLowerCase();
      const hitKw = kws.filter((k) => hay.includes(k));
      if (!hitKw.length) continue;
      const pos = Math.max(...hitKw.map((k) => hay.indexOf(k)));
      const excerpt = (s.description || '').slice(Math.max(0, pos - 60), Math.max(0, pos - 60) + QA_EXCERPT_LEN);
      hits.push({
        date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`,
        time: `${s.start}-${s.end}`, project: s.project, category: s.category,
        keyword: hitKw.join(','), excerpt,
      });
      if (hits.length >= QA_HITS_PER_QUERY * 3) return hits;
    }
  }
  return hits;
}

function parseQaJson(text) {
  const i = text.indexOf('{');
  const j = text.lastIndexOf('}');
  if (i >= 0 && j > i) {
    try { return JSON.parse(text.slice(i, j + 1)); } catch { /* 降级 */ }
  }
  return null;
}

ipcMain.handle('qa:ask', async (e, question) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const push = (info) => { try { win?.webContents.send('qa:progress', { info }); } catch { /* */ } };
  const dates = listSummaryFiles();
  const overview = dates.length
    ? `记忆库包含 ${dates.length} 天的10分钟时段汇总（${dates[0]} 至 ${dates[dates.length - 1]}），另有更早的每20秒屏幕记录。`
    : '记忆库目前为空。';
  const q = String(question || '').trim();
  if (!q) return { answer: '请输入问题。', steps: [] };

  const steps = [];
  const results = [];
  let answer = '';
  // 4B 模型指令遵循弱：用 few-shot 模板 + 单一 JSON 格式约束（实测有效）
  const today = dates[dates.length - 1] || '20260908';
  const planner = (ctx) => sidecarChat(
    `你是检索规划器。记忆库内容：${overview}\n` +
    `已检索情况：${ctx}\n` +
    `用户问题：${q}\n\n` +
    `你必须只输出一个 JSON 对象，两种格式二选一，禁止输出其他内容：\n` +
    `格式一（需要搜索时）：{"action":"search","searches":[{"date_from":"${today}","date_to":"${today}","keywords":["具体关键词"]}],"thought":"为什么这样搜"}\n` +
    `格式二（材料足够回答时）：{"action":"answer","answer":"完整回答内容"}\n\n` +
    `示例：用户问"我今天用了什么软件"且还没检索过，输出：\n` +
    `{"action":"search","searches":[{"date_from":"${today}","date_to":"${today}","keywords":["软件","WorkBuddy"]}],"thought":"先搜今天的软件相关记录"}\n\n` +
    `示例：已经检索到足够材料后，输出：\n` +
    `{"action":"answer","answer":"根据记录，您今天..."}`,
    640, 300000);

  for (let round = 1; round <= QA_MAX_ROUNDS; round++) {
    push(`第 ${round} 轮：${round === 1 ? '规划检索…' : '决定是否继续检索…'}`);
    const ctx = results.length
      ? `已执行过的检索与命中：\n${JSON.stringify(results.slice(0, 18), null, 1).slice(0, 6000)}\n`
      : '尚未执行任何检索。\n';
    let plan = null;
    try { plan = parseQaJson(await planner(ctx)); } catch { /* 重试 */ }
    if (!plan) {
      try {
        plan = parseQaJson(await planner(ctx + '\n注意：上一次输出不是合法 JSON，请重新输出。'));
      } catch { /* 走兜底 */ }
    }
    if (plan && plan.action === 'answer' && (plan.answer || '').trim()) {
      answer = plan.answer.trim();
      break;
    }
    const queries = (plan && plan.action === 'search' && Array.isArray(plan.searches))
      ? plan.searches.slice(0, 3) : [];
    if (!queries.length) break; // 无法解析 → 兜底回答
    for (const query of queries) {
      push(`🔍 检索 ${(query.keywords || []).join('/')}（${query.date_from || 'all'}~${query.date_to || 'all'}）`);
      const found = localSearch(query);
      results.push(...found);
      steps.push({ query, hits: found.length, samples: found.slice(0, 3) });
      push(`命中 ${found.length} 段`);
    }
  }

  if (!answer) {
    push('生成最终回答…');
    const ctx = results.length
      ? `检索到的相关记录：\n${results.slice(0, 18).map((r) =>
          `[${r.date} ${r.time}] ${r.project}（${r.category}）：${r.excerpt}`).join('\n').slice(0, 8000)}`
      : '检索未命中任何相关记录。';
    try {
      answer = await sidecarChat(
        `你是用户屏幕记忆库的问答助手。${overview}\n用户问题：${q}\n${ctx}\n` +
        `请基于以上材料用中文完整回答；材料不足时如实说明。` +
        `回答末尾标注引用的日期。`, 1024, 600000);
    } catch (err) {
      answer = `回答生成失败：${String(err).slice(0, 200)}`;
    }
  }
  return { answer, steps, used: results.length };
});

// ================= 管家桌宠（desktop/release-latest） =================
// 1) 本控制台一键启动桌宠（--pet 独立模式） 2) 引擎启动时同步唤起（截图联动）
// 3) 上传自定义桌宠形象（写入 server/data，与 server 的 /api/v1/butler-avatar 同规则）
const PET_EXE_CANDIDATES = [path.join(ARRODES_ROOT, 'desktop', 'release', 'win-unpacked', '阿罗德斯管家.exe')];
// 形象存放目录：与 server config.dbPath 默认值一致（ARRODES_DB_PATH 覆盖时两者需同步设置）
const AVATAR_DIR = process.env.ARRODES_DB_PATH
  ? path.resolve(process.env.ARRODES_DB_PATH)
  : path.join(ARRODES_ROOT, 'server', 'data');
const AVATAR_MAGIC = [
  { ext: '.png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: '.jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

let petProc = null;
let petAutoLaunch = true; // 截图联动开关（"管家"标签页可关，渲染层经 IPC 覆盖）

function findPetExe() {
  for (const p of PET_EXE_CANDIDATES) if (fs.existsSync(p)) return p;
  const electron = path.join(ARRODES_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  return fs.existsSync(electron) ? electron : null;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => { s.destroy(); resolve(false); });
  });
}

function launchPet(reason) {
  const exe = findPetExe();
  if (!exe) return { ok: false, reason: '未找到本项目桌宠程序，请先运行构建' };
  // 托管实例去重；桌宠自身还有单实例锁兜底（重复启动只聚焦已有窗口，不会双开）
  if (petProc && petProc.exitCode === null) {
    return { ok: true, created: false, reason: '桌宠已由本控制台启动' };
  }
  petProc = spawn(exe, /electron\.exe$/i.test(exe) ? [path.join(ARRODES_ROOT, 'desktop')] : [], {
    cwd: path.dirname(exe),
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    // 净化宿主环境（2026-09-09 事故）：WorkBuddy 会话注入的 NODE_OPTIONS shim 会劫持
    // http 模块，桌宠主进程 waitForHealth 的 127.0.0.1 轮询被挂起 → startBackend
    // 永不返回 → 桌宠永远不开窗（无报错无日志）。桌宠对内全是 localhost，代理/shim 一律清掉。
    env: {
      ...process.env,
      NODE_OPTIONS: '',
      HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '',
      NO_PROXY: '127.0.0.1,localhost',
    },
  });
  petProc.unref(); // 桌宠独立于控制台生命周期：控制台关闭不牵连桌宠
  pushLog(engineLog, '系统', `管家桌宠已唤起（${reason || '手动'}，pid ${petProc.pid}）`);
  return { ok: true, created: true };
}

ipcMain.handle('pet:launch', () => launchPet('手动'));
ipcMain.handle('pet:autolaunch', (_e, on) => {
  if (typeof on === 'boolean') petAutoLaunch = on;
  return petAutoLaunch;
});
ipcMain.handle('pet:status', async () => {
  // 桌宠在跑 ⇔ 其内嵌后端占住 3002 端口（比 tasklist 更快且跨托管/手启两种来源）
  const running = await isPortInUse(3003);
  return { running, exe: !!findPetExe(), managed: !!(petProc && petProc.exitCode === null) };
});

ipcMain.handle('avatar:upload', (_e, bytes) => {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    return { ok: false, error: '无效的图片数据' };
  }
  const buf = Buffer.from(bytes);
  if (buf.length > 5 * 1024 * 1024) return { ok: false, error: '图片超过 5MB' };
  const hit = AVATAR_MAGIC.find((m) => m.test(buf));
  if (!hit) return { ok: false, error: '仅支持 png/jpg/webp（已按文件内容校验，不看扩展名）' };
  try {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
    for (const m of AVATAR_MAGIC) {
      const old = path.join(AVATAR_DIR, `butler-avatar${m.ext}`);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    const target = path.join(AVATAR_DIR, `butler-avatar${hit.ext}`);
    fs.writeFileSync(target, buf);
    pushLog(engineLog, '系统', `桌宠形象已更新（${hit.ext}，${Math.round(buf.length / 1024)}KB）`);
    return { ok: true, ext: hit.ext, size: buf.length };
  } catch (err) {
    return { ok: false, error: `写入失败：${String(err).slice(0, 120)}` };
  }
});

ipcMain.handle('avatar:current', () => {
  for (const m of AVATAR_MAGIC) {
    const p = path.join(AVATAR_DIR, `butler-avatar${m.ext}`);
    if (fs.existsSync(p)) {
      const st = fs.statSync(p);
      return { exists: true, ext: m.ext, size: st.size, path: p };
    }
  }
  return { exists: false };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 720,
    title: '阿罗德斯管家',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(APP_ROOT, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(APP_ROOT, 'index.html'));
  // 渲染进程错误转发到主进程 stdout：UI 白屏/按钮失灵时直接看这里
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 3 && String(sourceId).includes('index.html')) {
      console.error(`[渲染进程] ${message} @ line ${line}`);
    }
  });
  win.webContents.on('preload-error', (_e, p, err) => {
    console.error(`[preload错误] ${p} :: ${err}`);
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (engineProc) engineProc.kill();
  if (sidecarProc) sidecarProc.kill();
  app.quit();
});
