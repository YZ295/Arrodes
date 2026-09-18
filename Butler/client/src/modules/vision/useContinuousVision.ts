import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyTaskObservation,
  createTaskSession,
  startTask,
  stopTask,
  toSessionView,
  type TaskSession,
  type TaskSessionView,
} from './taskSession';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import {
  ContinuousVisionSampler,
  buildScreenObservationPrompt,
  fetchWithTimeout,
  parseScreenObservation,
  type SampleOutcome,
  type ScreenFrame,
  type VisionObservation,
} from './continuousVision';

const DEFAULT_INTERVAL_MS = 10_000;
const MAX_FRAME_WIDTH = 1_280;
const THUMBNAIL_SIZE = { width: 64, height: 36 };
// 亮度标准差低于该阈值视为近乎纯色的黑帧/空帧（屏幕共享切换窗口时常见），
// 直接跳过，避免模型对无信息帧编造「典型屏幕内容」。
const MIN_FRAME_LUMA_STD = 2.5;
const DEFAULT_CHANGE_THRESHOLD = 10;

const INTERVAL_STORAGE_KEY = 'arrodes_vision_interval_ms';
const THRESHOLD_STORAGE_KEY = 'arrodes_vision_change_threshold';

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** 采样间隔（毫秒）：可调范围 3s~60s。调大 = 更省 GPU（治卡顿），代价是反应变慢 */
export function loadObservationInterval(): number {
  try {
    const raw = Number(localStorage.getItem(INTERVAL_STORAGE_KEY));
    return clampNumber(raw, 3_000, 60_000, DEFAULT_INTERVAL_MS);
  } catch {
    return DEFAULT_INTERVAL_MS;
  }
}

export function saveObservationInterval(ms: number): void {
  try {
    localStorage.setItem(INTERVAL_STORAGE_KEY, String(clampNumber(ms, 3_000, 60_000, DEFAULT_INTERVAL_MS)));
  } catch {
    // 忽略
  }
}

/** 场景变化阈值（0~100）：调大 = 更不明显的变化才触发推理（更省 GPU） */
export function loadChangeThreshold(): number {
  try {
    const raw = Number(localStorage.getItem(THRESHOLD_STORAGE_KEY));
    return clampNumber(raw, 2, 40, DEFAULT_CHANGE_THRESHOLD);
  } catch {
    return DEFAULT_CHANGE_THRESHOLD;
  }
}

export function saveChangeThreshold(value: number): void {
  try {
    localStorage.setItem(THRESHOLD_STORAGE_KEY, String(clampNumber(value, 2, 40, DEFAULT_CHANGE_THRESHOLD)));
  } catch {
    // 忽略
  }
}

export interface ContinuousVisionController {
  active: boolean;
  analyzing: boolean;
  error: string | null;
  observation: VisionObservation | null;
  goal: string;
  setGoal: (goal: string) => void;
  start: () => Promise<void>;
  stop: () => void;
  /** 最小任务闭环：当前状态 / 唯一下一步 / 上一步验证结果 */
  taskSession: TaskSessionView;
}

/** 排除区矩形（自有窗口的屏幕坐标，DIP） */
export interface ObservationRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameRect {
  rx: number;
  ry: number;
  rw: number;
  rh: number;
}

/**
 * 观察帧排除区：owner → 矩形。
 *
 * 凡是阿罗德斯自己的窗口都会遮挡屏幕，而观察帧里出现自己的界面会造成自我反馈。
 * 真机验收实测到的最严重后果：面板的验证文案把期望证据的字面量嵌进了句子
 * （「还没有出现上一步期望的「Done uploading.」」），而证据比对是子串匹配，
 * 于是系统读到自己的「还没出现」提示就能判定「上一步已完成」——凭空造出进展。
 *
 * 因此**桌宠与主窗口/面板都要排除**，不能只排除桌宠。
 * 用 owner 作键：同一窗口变更时覆盖，不同窗口互不干扰。
 */
const observationExclusions = new Map<string, ObservationRect>();

export function setObservationExclusion(owner: string, rect: ObservationRect | null): void {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    observationExclusions.delete(owner);
    return;
  }
  observationExclusions.set(owner, rect);
}

export function getObservationExclusions(): ObservationRect[] {
  return [...observationExclusions.values()];
}

let exclusionReporter: ExclusionReporter | null = null;
let lastReportedSignature = '';

/** 清空排除区（测试用） */
export function clearObservationExclusions(): void {
  observationExclusions.clear();
  lastReportedSignature = '';
}

/** 一次抓帧的排除区诊断：谁登记了、谁真的被抹掉、谁被跳过 */
export interface ExclusionReport {
  screenWidth: number;
  screenHeight: number;
  frameWidth: number;
  frameHeight: number;
  /** 已登记的 owner（含本窗口，前提是本窗口可见） */
  registered: string[];
  /** 本窗口可见性：false 时 `self` 不会出现在 registered 里，日志据此一眼可读 */
  selfVisible: boolean;
  /** 实际进入遮罩的矩形（帧坐标） */
  masked: FrameRect[];
  /** 登记了但没进入遮罩的 owner（落在画外或尺寸退化）——这是需要被看见的故障态 */
  skipped: string[];
}

type ExclusionReporter = (report: ExclusionReport) => void;

/**
 * 接上诊断出口。
 *
 * ⚠️ 诊断内容**只能落盘或走离线日志，绝不能渲染到屏幕上**——
 * 否则它自己就成了一段可被视觉观察读回的文案，正好踩中本模块要防的那个坑。
 */
export function setExclusionReporter(reporter: ExclusionReporter | null): void {
  exclusionReporter = reporter;
  lastReportedSignature = '';   // 重新接线后第一帧就上报，不必等排除区变化
}

/** 观察循环的一轮结果（含"抓不到帧"这类在采样器之外的失败） */
export type VisionTick = SampleOutcome | 'no-frame';

type VisionTickReporter = (tick: VisionTick) => void;

let visionTickReporter: VisionTickReporter | null = null;

/**
 * 接上观察循环的诊断出口，同样**只落盘不上屏**。
 *
 * 有了它才能回答「面板为什么一直显示旧内容」这类问题：
 * 循环在跑（有 tick）还是早就停了（完全没 tick）？是在 skip 还是每次都失败？
 * 没有这个出口时，这两种情况在界面上长得一模一样。
 */
export function setVisionTickReporter(reporter: VisionTickReporter | null): void {
  visionTickReporter = reporter;
}

/**
 * 本窗口是否可见。
 *
 * 隐藏窗口**不该**进排除区：它根本不在屏幕上，遮它只会白遮一大块观察区域，
 * 反而放大「遮挡导致没识别」。真机实测过这个回归——`--pet` 下管家窗口
 * `show:false`，但渲染进程照样能读到它的 `outerWidth/outerHeight`（860x720），
 * 于是白遮掉屏幕约 30%。
 *
 * 不能靠 `document.visibilityState` 判断：管家窗口设了
 * `backgroundThrottling:false`，这个开关**同时会让 Page Visibility API 失效**，
 * 隐藏时仍报 visible。所以由主进程通过 IPC 明确告知。
 *
 * 默认 true（保守）：宁可多遮一处，也不让系统读到自家面板。
 */
let selfWindowVisible = true;

export function setSelfWindowVisible(visible: boolean): void {
  selfWindowVisible = visible;
}

/** 本窗口在屏幕上的位置。不可见时返回 null——不登记，也就不会挤占观察区域。 */
function readSelfWindowRect(): ObservationRect | null {
  if (typeof window === 'undefined' || !selfWindowVisible) return null;
  const { outerWidth: width, outerHeight: height } = window;
  if (!width || !height) return null;
  return { x: window.screenX, y: window.screenY, width, height };
}

/**
 * 屏幕坐标 → 观察帧坐标。
 * 完全落在画外的窗口返回 null；覆盖整屏的窗口返回整帧矩形（宁可全遮也不漏遮）。
 */
export function mapRectToFrame(
  rect: ObservationRect,
  frameWidth: number,
  frameHeight: number,
  screenWidth: number,
  screenHeight: number,
): FrameRect | null {
  if (screenWidth <= 0 || screenHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) return null;
  const rx = Math.round((rect.x / screenWidth) * frameWidth);
  const ry = Math.round((rect.y / screenHeight) * frameHeight);
  const rw = Math.round((rect.width / screenWidth) * frameWidth);
  const rh = Math.round((rect.height / screenHeight) * frameHeight);
  if (rw <= 0 || rh <= 0) return null;
  if (rx + rw <= 0 || ry + rh <= 0 || rx >= frameWidth || ry >= frameHeight) return null;
  return { rx, ry, rw, rh };
}

/**
 * 计算本次抓帧要抹掉的区域，并给出可落盘的诊断。
 *
 * 本窗口没有 move 事件，所以在这里刷新自己的位置——窗口移动后不会漏遮。
 * 窗口最大化盖住整屏时返回整个帧，此时观察帧近乎纯色会被纯色检查挡下：
 * 宁可停止观察，也不能让系统读到自己的界面。
 *
 * 排除区发生变化时回调一次 reporter：这是「遮罩到底有没有生效」唯一的可观测出口，
 * 否则这个机制只能靠推理，出问题时看不见。
 */
export function describeExclusions(
  frameWidth: number,
  frameHeight: number,
  screenWidth: number,
  screenHeight: number,
): ExclusionReport {
  setObservationExclusion('self', readSelfWindowRect());

  const registered: string[] = [];
  const masked: FrameRect[] = [];
  const skipped: string[] = [];
  for (const [owner, rect] of observationExclusions) {
    registered.push(owner);
    const mapped = mapRectToFrame(rect, frameWidth, frameHeight, screenWidth, screenHeight);
    if (mapped) masked.push(mapped);
    else skipped.push(owner);
  }

  const report: ExclusionReport = {
    screenWidth, screenHeight, frameWidth, frameHeight,
    registered, selfVisible: selfWindowVisible, masked, skipped,
  };
  const signature = JSON.stringify([
    registered, selfWindowVisible, masked, skipped, frameWidth, frameHeight, screenWidth, screenHeight,
  ]);
  if (signature !== lastReportedSignature) {
    lastReportedSignature = signature;
    exclusionReporter?.(report);
  }
  return report;
}

export function resolveExclusionRects(
  frameWidth: number,
  frameHeight: number,
  screenWidth: number,
  screenHeight: number,
): FrameRect[] {
  return describeExclusions(frameWidth, frameHeight, screenWidth, screenHeight).masked;
}

export function captureVideoFrame(video: HTMLVideoElement): ScreenFrame | null {
  if (!video.videoWidth || !video.videoHeight) return null;
  const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(video, 0, 0, width, height);
  // 裁掉阿罗德斯自己的窗口区域：用区域上方的背景色填充，
  // 保证观察帧内容恒定（指纹不变化→不触发自我反馈），也不会被读成屏幕证据
  const screenWidth = typeof screen !== 'undefined' && screen.width ? screen.width : width;
  const screenHeight = typeof screen !== 'undefined' && screen.height ? screen.height : height;
  for (const { rx, ry, rw, rh } of resolveExclusionRects(width, height, screenWidth, screenHeight)) {
    const sampleX = Math.max(0, Math.min(width - 1, rx + Math.round(rw / 2)));
    const sampleY = Math.max(0, Math.min(height - 1, ry - 8));
    const sampled = context.getImageData(sampleX, sampleY, 1, 1).data;
    context.fillStyle = `rgb(${sampled[0]},${sampled[1]},${sampled[2]})`;
    context.fillRect(rx - 2, ry - 2, rw + 4, rh + 4);
  }

  const thumbnail = document.createElement('canvas');
  thumbnail.width = THUMBNAIL_SIZE.width;
  thumbnail.height = THUMBNAIL_SIZE.height;
  const thumbnailContext = thumbnail.getContext('2d', { willReadFrequently: true });
  if (!thumbnailContext) return null;
  thumbnailContext.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
  const rgba = thumbnailContext.getImageData(0, 0, thumbnail.width, thumbnail.height).data;
  const fingerprint = new Uint8Array(THUMBNAIL_SIZE.width * THUMBNAIL_SIZE.height);
  let lumaSum = 0;
  for (let source = 0, target = 0; source < rgba.length; source += 4, target++) {
    fingerprint[target] = Math.round(0.299 * rgba[source] + 0.587 * rgba[source + 1] + 0.114 * rgba[source + 2]);
    lumaSum += fingerprint[target];
  }
  const lumaMean = lumaSum / fingerprint.length;
  let lumaVariance = 0;
  for (let index = 0; index < fingerprint.length; index++) {
    lumaVariance += (fingerprint[index] - lumaMean) ** 2;
  }
  if (Math.sqrt(lumaVariance / fingerprint.length) < MIN_FRAME_LUMA_STD) return null;

  return {
    imageBase64: canvas.toDataURL('image/jpeg', 0.72).split(',')[1] || '',
    fingerprint,
  };
}

/**
 * 单次推理超时。冷启动约 15 秒、热态 2~4 秒，给足余量；
 * 它的作用是**恢复**而非控制时延——没有它，一次挂起的请求会永久锁死观察循环。
 */
const VISION_REQUEST_TIMEOUT_MS = 120_000;

async function analyzeScreen(imageBase64: string, goal: string): Promise<VisionObservation> {
  const response = await fetchWithTimeout('/api/v1/vision/analyze-base64', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      imageFormat: 'jpeg',
      prompt: buildScreenObservationPrompt(goal),
    }),
  }, VISION_REQUEST_TIMEOUT_MS, '视觉分析超时，已中断本次请求');
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `视觉服务 ${response.status}` }));
    throw new Error(body.error || `视觉服务 ${response.status}`);
  }
  const body = await response.json() as Partial<VisionObservation>;
  if (typeof body.description !== 'string' || !body.description.trim()) {
    throw new Error('视觉服务返回了空描述');
  }
  return parseScreenObservation(body.description, {
    durationMs: typeof body.durationMs === 'number' ? body.durationMs : 0,
    model: typeof body.model === 'string' ? body.model : 'unknown',
  });
}

export function useContinuousVision(isSpeaking: boolean): ContinuousVisionController {
  const [active, setActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState<VisionObservation | null>(null);
  const [goal, setGoal] = useState('识别当前屏幕正在进行的任务');
  const [taskSession, setTaskSession] = useState<TaskSessionView>(() => toSessionView(createTaskSession()));
  const taskRef = useRef<TaskSession>(createTaskSession());
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef(0);
  const speakingRef = useRef(isSpeaking);
  const goalRef = useRef(goal);
  useEffect(() => { speakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { goalRef.current = goal; }, [goal]);

  const stop = useCallback(() => {
    runIdRef.current++;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    videoRef.current = null;
    setActive(false);
    setAnalyzing(false);
    // 停止任务：此后不再观察、不再推理
    taskRef.current = stopTask(taskRef.current);
    setTaskSession(toSessionView(taskRef.current));
  }, []);

  const start = useCallback(async () => {
    stop();
    setError(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('当前运行环境不支持屏幕捕获');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 2, max: 5 } },
        audio: false,
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      streamRef.current = stream;
      videoRef.current = video;
      setActive(true);
      // 用户明确开始任务：绑定目标并进入观察态
      taskRef.current = startTask(createTaskSession(goalRef.current));
      setTaskSession(toSessionView(taskRef.current));

      const runId = ++runIdRef.current;
      const intervalMs = loadObservationInterval();
      // 诊断去重：只有"真的分析了"和"失败了"每次都报，
      // 其余跳过态只在状态切换时报一次，避免日志被 10 秒一轮的 skip 刷满
      let lastTick: VisionTick | null = null;
      const reportTick = (tick: VisionTick) => {
        const alwaysReport = tick === 'analyzed' || tick === 'failed';
        if (!alwaysReport && tick === lastTick) return;
        lastTick = tick;
        visionTickReporter?.(tick);
      };
      const sampler = new ContinuousVisionSampler({
        analyze: (imageBase64) => analyzeScreen(imageBase64, goalRef.current),
        threshold: loadChangeThreshold(),
        onOutcome: reportTick,
      });
      const loop = async () => {
        if (runId !== runIdRef.current) return;
        const frame = captureVideoFrame(video);
        if (frame) {
          setAnalyzing(true);
          try {
            const next = await sampler.sample(frame, speakingRef.current);
            if (next) {
              // 并入任务会话：产出「当前状态 + 唯一下一步 + 上一步验证结果」
              const updated = applyTaskObservation(taskRef.current, next);
              taskRef.current = updated;
              const view = toSessionView(updated);
              setTaskSession(view);
              const enriched: VisionObservation = { ...next, task: view };
              setObservation(enriched);
              eventBus.emit(EVENTS.VISION_OBSERVATION, enriched);
            }
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '屏幕观察失败');
          } finally {
            setAnalyzing(false);
          }
        } else {
          // 抓不到帧：近乎纯色的黑帧/空帧，或视频还没就绪
          reportTick('no-frame');
        }
        if (runId === runIdRef.current) timerRef.current = setTimeout(loop, intervalMs);
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', stop, { once: true });
      void loop();
    } catch (cause) {
      stop();
      setError(cause instanceof Error ? cause.message : '无法开始屏幕观察');
    }
  }, [stop]);

  useEffect(() => stop, [stop]);
  return { active, analyzing, error, observation, goal, setGoal, start, stop, taskSession };
}
