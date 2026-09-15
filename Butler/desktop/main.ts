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
import { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell, dialog, session, screen, desktopCapturer } from 'electron';
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
const PORT = Number(process.env.ARRODES_PORT || 3003);
app.setName('arrodes-butler');
app.setAppUserModelId('com.arrodes.butler');
app.setPath('userData', resolve(app.getPath('appData'), 'arrodes-butler'));
const APP_ROOT = app.isPackaged ? process.resourcesPath : resolve(__dirname, '../..');

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
  butlerStatusUrl = `${uiUrl.origin}/api/v1/butler/status`;
  localAccessToken = randomBytes(32).toString('base64url');
  const dbPath = process.env.ARRODES_DB_PATH
    ? resolve(process.env.ARRODES_DB_PATH)
    : app.isPackaged ? resolve(app.getPath('userData'), 'data') : resolve(serverDir, 'data');

  backendProc = fork(entry, [], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'production',
      DB_PATH: dbPath,
      ARRODES_REPO_ROOT: APP_ROOT,
      BUTLER_PYTHON: process.env.BUTLER_PYTHON || resolve(APP_ROOT, 'vision-sidecar/.venv/Scripts/python.exe'),
      BUTLER_SIDECAR_URL: 'http://127.0.0.1:12012',
      COSYVOICE3_PORT: '12013',
      COSYVOICE3_SIDECAR_URL: 'http://127.0.0.1:12013',
      TTS_OUTPUT_DIR: resolve(dbPath, 'tts-output'),
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

  setPetInteractive(true); // 管家流程步骤 3：默认交互模式（可调机位/透明度/开观察）
  petWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  petWindow.webContents.on('context-menu', () => showPetContextMenu());
  // 边界广播（节流 200ms）：供主窗口在观察帧中裁掉管家区域，防自我反馈
  let lastBoundsSent = 0;
  const sendBounds = () => {
    const now = Date.now();
    if (now - lastBoundsSent < 200) return;
    lastBoundsSent = now;
    petWindow?.webContents.send('pet:bounds', petWindow.getBounds());
  };
  petWindow.on('move', sendBounds);
  petWindow.on('resize', sendBounds);
  petWindow.webContents.on('did-finish-load', sendBounds);
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
  petWindow.on('closed', () => {
    stopGazePolling();
    petWindow = null;
  });
  startGazePolling();
}

// ===== T5 目光跟随：轮询全局光标 → 归一化(-1..1) → 桌宠窗口 =====

/** 光标相对桌宠窗口中心的归一化坐标（clamp 到 -1..1，供 EmotionBall setGaze 直接使用） */
export function normalizeGaze(
  cursor: { x: number; y: number },
  win: { x: number; y: number; width: number; height: number },
): { nx: number; ny: number } {
  const halfW = Math.max(1, win.width / 2);
  const halfH = Math.max(1, win.height / 2);
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    nx: clamp((cursor.x - (win.x + win.width / 2)) / halfW),
    ny: clamp((cursor.y - (win.y + win.height / 2)) / halfH),
  };
}

let gazeTimer: ReturnType<typeof setInterval> | null = null;
const GAZE_POLL_MS = 100; // 10Hz：目光平滑且 CPU 占用可忽略

function startGazePolling() {
  if (gazeTimer) return;
  gazeTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) return;
    try {
      const cursor = screen.getCursorScreenPoint();
      const bounds = petWindow.getBounds();
      const { nx, ny } = normalizeGaze(cursor, bounds);
      petWindow.webContents.send('pet:gaze', nx, ny);
    } catch { /* 屏幕不可用（锁屏/断开），下个周期重试 */ }
  }, GAZE_POLL_MS);
}

function stopGazePolling() {
  if (gazeTimer) {
    clearInterval(gazeTimer);
    gazeTimer = null;
  }
}

/** 管家控制台窗口：独立 Electron 窗口，承载管家后端引擎面板 */
async function createButlerWindow(): Promise<void> {
  if (butlerWindow) {
    if (butlerWindow.isMinimized()) butlerWindow.restore();
    butlerWindow.showInactive();
    butlerWindow.focus();
    return;
  }
  butlerWindow = new BrowserWindow({
    width: 860,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: '阿罗德斯管家',
    show: !process.argv.includes('--pet'),
    autoHideMenuBar: true,
    backgroundColor: '#0f1115',
    icon: resolve(ROOT, 'client/dist/favicon.svg'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      preload: join(__dirname, 'butlerPreload.cjs'),
    },
  });
  butlerWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); butlerWindow?.hide(); } });
  butlerWindow.on('closed', () => { butlerWindow = null; });
  await butlerWindow.loadURL(getUiUrl('butler'));
}

// 桌宠窗口控制：渲染进程拖拽移动 + 悬停暂停点击穿透
ipcMain.on('pet:move-by', (event, dx: number, dy: number) => {
  if (!petWindow || event.sender !== petWindow.webContents || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(x + Math.round(dx), y + Math.round(dy));
});

ipcMain.on('pet:resize', (event, width: number, height: number) => {
  dlog(`pet resize ipc: ${width}x${height}`);
  if (!petWindow || typeof width !== 'number' || typeof height !== 'number') return;
  if (width < 280 || width > 1200) return;
  // Windows 上 resizable:false 时 setSize 会被忽略，需临时开启
  petWindow.setResizable(true);
  petWindow.setSize(Math.round(width), Math.round(height));
  petWindow.setResizable(false);
  dlog(`pet resized to ${Math.round(width)}x${Math.round(height)}`);
});

ipcMain.on('pet:vision-state', (event, on: boolean) => {
  if (!petWindow || event.sender !== petWindow.webContents || typeof on !== 'boolean') return;
  petVisionOn = on;
});

/**
 * 交互/装饰双态切换（airi "Fade on hover" 模式简版）：
 * - 装饰态（挂机）：置顶 + 全穿透 + 悬停淡出，绝不干扰工作
 * - 交互态：鼠标可用（机位面板/透明度/右键菜单/拖动）
 * 窗口永远置顶；观察帧裁剪独立生效，与状态无关。
 */
function setPetInteractive(on: boolean): void {
  petInteractive = on;
  if (interactiveTimer) { clearTimeout(interactiveTimer); interactiveTimer = null; }
  if (!petWindow) return;
  // 永远置顶（Bongo Cat 同款 HWND_TOPMOST 语义）：screen-saver 为最高置顶层，
  // 压过 'floating' 层的其他置顶应用；全屏独占游戏为系统级例外（无解，Bongo Cat 同样如此）
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.setIgnoreMouseEvents(!on, { forward: true });
  petWindow.webContents.send('pet:interactive', on);
  dlog(`pet interactive=${on}`);
  refreshTrayMenu();
}

/** 托盘菜单（状态变化时重建以刷新勾选态） */
function refreshTrayMenu(): void {
  if (!petTray) return;
  petTray.setContextMenu(Menu.buildFromTemplate([
    { label: petInteractive ? '交互模式：已开启' : '交互模式：已关闭（穿透装饰）', type: 'checkbox', checked: petInteractive, click: () => setPetInteractive(!petInteractive) },
    { label: petVisionOn ? '视觉观察：已开启' : '视觉观察：已关闭', type: 'checkbox', checked: petVisionOn, click: () => petWindow?.webContents.send('pet:vision-toggle') },
    { label: '管家控制台', click: () => { void createButlerWindow(); } },
    { type: 'separator' },
    { label: '退出阿罗德斯', click: () => app.quit() },
  ]));
}

function showPetContextMenu(): void {
  if (!petWindow) return;
  const menu = Menu.buildFromTemplate([
    {
      label: petVisionOn ? '视觉观察：已开启（点击关闭）' : '视觉观察：已关闭（点击开启）',
      click: () => petWindow?.webContents.send('pet:vision-toggle'),
    },
    { type: 'separator' },
    {
      label: '退出阿罗德斯',
      click: () => app.quit(),
    },
  ]);
  menu.popup({ window: petWindow });
}

ipcMain.on('pet:opacity', (event, opacity: number) => {
  if (!petWindow || event.sender !== petWindow.webContents || typeof opacity !== 'number') return;
  petWindow.setOpacity(Math.min(1, Math.max(0.15, opacity)));
});

ipcMain.handle('butler:launch-pet', () => {
  if (petWindow) {
    if (petWindow.isMinimized()) petWindow.restore();
    petWindow.showInactive();
    return { created: false };
  }
  return createPetWindow().then(() => ({ created: true }));
});

ipcMain.on('pet:interactive-toggle', (event) => {
  if (!petWindow || event.sender !== petWindow.webContents) return;
  setPetInteractive(!petInteractive);
});

ipcMain.on('pet:set-interactive', (event, interactive: boolean) => {
  if (!petInteractive && interactive) return; // 装饰态：不响应悬停交互
  if (!petWindow || event.sender !== petWindow.webContents || typeof interactive !== 'boolean') return;
  petWindow.setIgnoreMouseEvents(!interactive, { forward: true });
});

// ---- 生命周期 ----
/** 桌宠独立模式：--pet 启动时只开桌宠窗，不开主界面 */
const PET_ONLY = true;

/** 拉起 Qwen3-VL 视觉 sidecar（桌宠模式需要屏幕观察；Ollama 后端，零 torch 依赖） */
let visionProc: ChildProcess | null = null;
let gatewayProc: ChildProcess | null = null;
let petVisionOn = false;   // 视觉观察状态（右键菜单标签用）
let petInteractive = true;  // 交互模式：可点击/右键/拖动/调面板；关闭=装饰模式（穿透+悬停淡出）
let petTray: Tray | null = null;
let butlerWindow: BrowserWindow | null = null;
let butlerStatusUrl = `http://localhost:${PORT}/api/v1/butler/status`;
let interactiveTimer: ReturnType<typeof setTimeout> | null = null;
/** 桌面端文件日志：双击启动时 stdout 丢失，关键事件落盘便于诊断 */
function dlog(msg: string): void {
  try {
    appendFileSync(join(app.getPath('userData'), 'desktop.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch { /* 日志失败不影响运行 */ }
}

/** 拉起 Ollama 推理后端（侧车的唯一推理依赖：没有它侧车会 degraded，屏幕观察全部报错） */
let ollamaProc: ChildProcess | null = null;

/** 按候选路径找 ollama 可执行文件；默认 E:\AI\Ollama（本机安装位置），可用 ARRODES_OLLAMA_BIN 覆盖 */
function resolveOllamaBin(): string | null {
  const candidates = [
    process.env.ARRODES_OLLAMA_BIN,
    'E:\\AI\\Ollama\\ollama.exe',
    join(process.env.LOCALAPPDATA || '', 'Programs/Ollama/ollama.exe'),
    'C:\\Program Files\\Ollama\\ollama.exe',
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p)) || null;
}

/** 确保 Ollama 在线：已在跑则跳过；否则拉起并等待端口就绪（超时只告警，不阻塞开窗） */
async function ensureOllama(): Promise<void> {
  if (await isPortInUse(11434)) {
    dlog('ollama: 已在线，跳过拉起');
    return;
  }
  const bin = resolveOllamaBin();
  if (!bin) {
    dlog('ollama: 未找到可执行文件（可用 ARRODES_OLLAMA_BIN 指定），屏幕观察将不可用');
    return;
  }
  dlog(`ollama: 拉起 ${bin}`);
  // 必须不开 detached：Windows 下 detached 会让子进程拥有自己的控制台窗口，
  // 且此时 windowsHide(CREATE_NO_WINDOW) 会被忽略 → 每次启动都弹一个黑窗。
  // 非 detached 的子进程在父进程退出后本就会继续运行（stdio 为 ignore，不收 SIGHUP），
  // 所以独立存活不需要 detached 来保证。
  const proc = spawn(bin, ['serve'], { stdio: 'ignore', windowsHide: true });
  // unref 只让主进程不等待它退出，与 detached 无关；不要为了"独立存活"去开 detached
  proc.unref();
  ollamaProc = proc;
  proc.on('exit', (code) => {
    dlog(`ollama: 进程退出（${String(code)}）`);
    if (ollamaProc === proc) ollamaProc = null;
  });
  // 等端口就绪，最多 20s；模型首次加载较慢，超时不阻塞开窗，由前端重试兜底
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isPortInUse(11434)) {
      dlog('ollama: 就绪（11434）');
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  dlog('ollama: 20s 内未就绪，继续开窗（屏幕观察可能暂时报错，前端可重试）');
}

/** WorkBuddy 远程控制网关：Arrodes 启动时确保在线（detached 独立进程，Arrodes 退出不影响） */
function startVisionSidecar(): void {
  // 2026-09-09 统一为 Qwen3-VL：仅需一个带 fastapi 的 python（默认 vision-sidecar/.venv），
  // 推理走本机 Ollama（qwen3-vl:4b-instruct）。可用 ARRODES_SIDECAR_PYTHON 覆盖 python 路径。
  const python = process.env.ARRODES_SIDECAR_PYTHON
    || join(APP_ROOT, 'vision-sidecar/.venv/Scripts/python.exe');
  const script = join(APP_ROOT, 'vision-sidecar/qwen_vl_sidecar.py');
  if (!existsSync(python) || !existsSync(script)) {
    console.log('[Desktop] 未找到侧车 python（vision-sidecar/.venv 或 ARRODES_SIDECAR_PYTHON），跳过视觉 sidecar（屏幕观察将不可用）');
    return;
  }
  visionProc = spawn(python, ['-u', script, '--port', '12012'], {
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const proc = visionProc;
  proc.stdout?.on('data', (d: Buffer) => console.log('[Qwen-VL]', d.toString().trim()));
  proc.stderr?.on('data', (d: Buffer) => console.log('[Qwen-VL]', d.toString().trim()));
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
    if (process.argv.includes('--smoke-test')) {
      await startBackend();
      console.log('[Desktop] READY arrodes-butler');
      setTimeout(() => app.quit(), 14000);
      return;
    }
    // 托盘：管家交互的永久入口（装饰态下窗口收不到鼠标，靠这里切回交互）
    try {
      const trayIcon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAcUlEQVR4nO3O2w3AIAxDUQbuCAzNBu0CvEzsBFWx5O97SsmBq097Zw8LyyBomAqxxk0IVvwIwY5DCFV8GxEKUMeXiFCAV3yISEACEhAO8ER041cAPBDT+BUAJWIrrkJAcTbiKM5CmOIWCC2MQmTh3+4D6GTVs6eUTeoAAAAASUVORK5CYII=');
      petTray = new Tray(trayIcon);
      petTray.setToolTip('阿罗德斯管家');
      refreshTrayMenu();
      dlog('tray created');
    } catch (err) {
      console.warn('[Desktop] 托盘创建失败:', err);
    }

    // 置顶看门狗：全屏切换/DWM 重置可能丢掉 topmost 标志，每 5 秒校验补挂
    setInterval(() => {
      if (petWindow && !petWindow.isAlwaysOnTop()) {
        petWindow.setAlwaysOnTop(true, 'screen-saver');
        dlog('watchdog: re-asserted always-on-top');
      }
    }, 5000);

    // 管家引擎 ↔ 桌宠连接：轮询引擎状态，变化时推送桌宠（采集运行中 → 桌宠忙碌表情）
    let butlerEngineRunning: boolean | null = null;
    setInterval(async () => {
      if (!petWindow) return;
      try {
        const res = await fetch(butlerStatusUrl, {
          headers: { 'x-arrodes-local-token': localAccessToken },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { engine?: { running?: boolean } };
        const running = json.engine?.running === true;
        if (running !== butlerEngineRunning) {
          butlerEngineRunning = running;
          petWindow.webContents.send('butler:engine', running);
          dlog(`butler engine -> pet: ${running}`);
        }
      } catch { /* 后端未就绪时静默 */ }
    }, 5000);

    await startBackend();
    // Explicit screen sharing belongs to this application's console, never the original App.
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        const source = sources[0];
        callback(source ? { video: source } : {});
      } catch { callback({}); }
    });
    if (!process.argv.includes('--smoke-test')) {
      // 推理后端先于侧车：侧车没有 Ollama 会 degraded，导致屏幕观察整条链路报错
      await ensureOllama();
      if (!(await isPortInUse(12012))) startVisionSidecar();
      await createButlerWindow();
      await createPetWindow();
    }
    console.log('[Desktop] READY arrodes-butler');
  } catch (err) {
    dlog(`STARTUP FAILED: ${String(err)}`);
    console.error('[Desktop] 启动失败:', err);
    // 清理可能残留的后端子进程
    quitting = true;
    if (backendProc) {
      try { if (backendProc.connected) backendProc.send('shutdown'); else backendProc.kill(); } catch { /* ignore */ }
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
    if (!butlerWindow) void createButlerWindow(); else butlerWindow.show();
    if (!petWindow) void createPetWindow();
  });
});

}

app.on('will-quit', () => { if (petTray) { petTray.destroy(); petTray = null; } });

app.on('window-all-closed', () => {
  // 停后端与视觉 sidecar 再退出（Ollama 由 start.vbs/ensureOllama 管理，不在此回收）
  quitting = true;
  if (backendProc) {
    try { if (backendProc.connected) backendProc.send('shutdown'); else backendProc.kill(); } catch { /* ignore */ }
  }
  stopVisionSidecar();
  app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  if (backendProc) {
    try { if (backendProc.connected) backendProc.send('shutdown'); else backendProc.kill(); } catch { /* ignore */ }
  }
  stopVisionSidecar();
});
