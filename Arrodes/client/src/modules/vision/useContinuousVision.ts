import { useCallback, useEffect, useRef, useState } from 'react';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import {
  ContinuousVisionSampler,
  buildScreenObservationPrompt,
  parseScreenObservation,
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
}

/** 观察帧排除区域（管家窗口屏幕坐标，DIP）：防止管家出现在观察画面中触发自我反馈 */
let observationExclusion: { x: number; y: number; width: number; height: number } | null = null;

export function setObservationExclusion(rect: { x: number; y: number; width: number; height: number } | null): void {
  observationExclusion = rect;
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
  // 裁掉管家窗口区域：用区域上方的背景色填充，保证观察帧内容恒定（指纹不变化→不触发自我反馈）
  if (observationExclusion) {
    const ex = observationExclusion;
    const sw = typeof screen !== 'undefined' && screen.width ? screen.width : width;
    const sh = typeof screen !== 'undefined' && screen.height ? screen.height : height;
    const rx = Math.round((ex.x / sw) * width);
    const ry = Math.round((ex.y / sh) * height);
    const rw = Math.round((ex.width / sw) * width);
    const rh = Math.round((ex.height / sh) * height);
    if (rw > 0 && rh > 0) {
      const sampleX = Math.max(0, Math.min(width - 1, rx + Math.round(rw / 2)));
      const sampleY = Math.max(0, Math.min(height - 1, ry - 8));
      const sampled = context.getImageData(sampleX, sampleY, 1, 1).data;
      context.fillStyle = `rgb(${sampled[0]},${sampled[1]},${sampled[2]})`;
      context.fillRect(rx - 2, ry - 2, rw + 4, rh + 4);
    }
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

async function analyzeScreen(imageBase64: string, goal: string): Promise<VisionObservation> {
  const response = await fetch('/api/v1/vision/analyze-base64', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64,
      imageFormat: 'jpeg',
      prompt: buildScreenObservationPrompt(goal),
    }),
  });
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

      const runId = ++runIdRef.current;
      const intervalMs = loadObservationInterval();
      const sampler = new ContinuousVisionSampler({
        analyze: (imageBase64) => analyzeScreen(imageBase64, goalRef.current),
        threshold: loadChangeThreshold(),
      });
      const loop = async () => {
        if (runId !== runIdRef.current) return;
        const frame = captureVideoFrame(video);
        if (frame) {
          setAnalyzing(true);
          try {
            const next = await sampler.sample(frame, speakingRef.current);
            if (next) {
              setObservation(next);
              eventBus.emit(EVENTS.VISION_OBSERVATION, next);
            }
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : '屏幕观察失败');
          } finally {
            setAnalyzing(false);
          }
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
  return { active, analyzing, error, observation, goal, setGoal, start, stop };
}
