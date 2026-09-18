import type { VisionObservation } from '../modules/vision/continuousVision';
import type { VerificationResult } from '../modules/vision/taskSession';

export interface DesktopPetSnapshot {
  active: boolean;
  analyzing: boolean;
  error: string | null;
  observation: VisionObservation | null;
}

/** 上一步验证结果（管家第三行：验证结果） */
export interface DesktopPetVerification {
  result: VerificationResult;
  /** 判定依据（人话，直接显示） */
  text: string;
}

export interface DesktopPetViewModel {
  title: string;
  state: string;
  action: string | null;
  note: string | null;
  status: string;
  tone: 'idle' | 'working' | 'ready' | 'uncertain' | 'error';
  confidence: number | null;
  diagnostics: DesktopPetDiagnostics | null;
  /** 上一步验证结果；没有上一步（或任务未开始）时为 null */
  verification: DesktopPetVerification | null;
  /** 这份内容有多新。面板只持有「最后一次观察」，必须说清它是什么时候的 */
  freshness: DesktopPetFreshness;
}

/**
 * 内容新鲜度。
 *
 * 为什么必须有：面板只持有最后一次观察，没有任何东西会清空它，
 * 于是「循环没在跑」和「循环在跑但内容很旧」在界面上长得一模一样——
 * 用户切到别的应用后，仍看到上一个应用的结论，且无从判断它有多旧。
 */
export interface DesktopPetFreshness {
  /** live=接近实时 recent=几分钟前 stale=可能已过期 stopped=观察已停止 */
  level: 'live' | 'recent' | 'stale' | 'stopped';
  label: string;
}

export interface DesktopPetDiagnostics {
  model: string;
  durationMs: number;
  observedAt: string | null;
}

function toDiagnostics(observation: VisionObservation | null): DesktopPetDiagnostics | null {
  if (!observation) return null;
  return {
    model: observation.model,
    durationMs: observation.durationMs,
    observedAt: observation.observedAt ?? null,
  };
}

const MAX_COPY_LENGTH = 160;
const MIN_ADVICE_CONFIDENCE = 0.55;

function compact(text: string | null | undefined): string | null {
  const value = text?.trim();
  return value ? value.slice(0, MAX_COPY_LENGTH) : null;
}

/** 从观察结果里取出「上一步验证结果」；没有上一步或未开始任务时为 null */
function toVerification(observation: VisionObservation | null): DesktopPetVerification | null {
  const verification = observation?.task?.verification;
  if (!verification || verification.result === 'none') return null;
  return {
    result: verification.result,
    text: compact(verification.basis) || verification.basis,
  };
}

/** 一帧之内算「刚刚」；超过这个窗就标分钟数 */
const LIVE_WINDOW_MS = 60_000;
/** 超过这个窗就明确提示「可能已过期」，避免用户把它当当前状态 */
const STALE_WINDOW_MS = 5 * 60_000;

function ageLabel(ageMs: number): string {
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  return `${Math.floor(minutes / 60)} 小时前`;
}

/**
 * 时间戳 → 新鲜度。
 * 观察已停止时一律按 stopped 处理，并交代上次是多久以前——
 * 用户遇到"显示的还是 Arduino"时，缺的正是这一句。
 */
function toFreshness(
  observation: VisionObservation | null,
  active: boolean,
  now: number,
): DesktopPetFreshness {
  const parsed = observation?.observedAt ? Date.parse(observation.observedAt) : Number.NaN;
  const ageMs = Number.isFinite(parsed) ? Math.max(0, now - parsed) : null;

  if (!active) {
    return { level: 'stopped', label: ageMs === null ? '观察已停止' : `观察已停止 · 上次 ${ageLabel(ageMs)}` };
  }
  // 观察中却拿不到可用时间戳：只说在等画面，不假装新鲜、也不编造时间
  if (ageMs === null) return { level: 'live', label: '等待画面' };
  if (ageMs < LIVE_WINDOW_MS) return { level: 'live', label: '刚刚' };
  if (ageMs < STALE_WINDOW_MS) return { level: 'recent', label: ageLabel(ageMs) };
  return { level: 'stale', label: `${ageLabel(ageMs)}·可能已过期` };
}

export function createDesktopPetViewModel(
  observation: VisionObservation | null,
  runtime: Omit<DesktopPetSnapshot, 'observation'>,
  now: number = Date.now(),
): DesktopPetViewModel {
  const freshness = toFreshness(observation, runtime.active, now);

  if (runtime.error) {
    return {
      title: '屏幕观察中断',
      state: compact(runtime.error) || '请回到主窗口检查视觉服务。',
      action: null,
      note: '请回到主窗口重试。',
      status: '需要处理',
      tone: 'error',
      confidence: null,
      diagnostics: null,
      verification: null,
      freshness,
    };
  }

  if (runtime.analyzing) {
    return {
      title: observation?.activeApplication || '正在观察变化',
      state: observation?.currentState || observation?.userActivity || observation?.description || '正在理解当前画面…',
      action: null,
      note: null,
      status: '分析中',
      tone: 'working',
      confidence: observation?.confidence ?? null,
      diagnostics: toDiagnostics(observation),
      verification: toVerification(observation),
      freshness,
    };
  }

  if (!runtime.active) {
    return {
      title: '阿罗德斯已待命',
      state: '在主窗口开始任务后，我会在画面明显变化时更新。',
      action: null,
      note: '屏幕不会在未授权时被采集。',
      status: '未观察',
      tone: 'idle',
      confidence: null,
      diagnostics: null,
      verification: null,
      freshness,
    };
  }

  if (!observation) {
    return {
      title: '等待第一个画面',
      state: '保持当前窗口可见，我正在等待足够清晰的变化。',
      action: null,
      note: null,
      status: '观察中',
      tone: 'working',
      confidence: null,
      diagnostics: null,
      verification: null,
      freshness,
    };
  }

  const confidence = observation.confidence ?? null;
  const uncertainty = compact(observation.uncertainties?.[0]);
  const expectedEvidence = compact(observation.expectedEvidence?.[0]);
  const adviceAllowed = confidence !== null && confidence >= MIN_ADVICE_CONFIDENCE;
  const proposedAction = observation.contextKind === 'prompt'
    ? observation.promptFeedback || observation.nextSuggestion
    : observation.nextAction || observation.nextSuggestion;

  return {
    title: compact(observation.activeApplication) || '当前屏幕',
    state: compact(observation.currentStep)
      || compact(observation.currentState)
      || compact(observation.userActivity)
      || compact(observation.description)
      || '画面已更新。',
    action: adviceAllowed ? compact(proposedAction) : null,
    note: uncertainty
      || (expectedEvidence ? `等待证据：${expectedEvidence}` : null)
      || (!adviceAllowed ? '证据还不足，我先不猜下一步。' : null),
    status: observation.contextKind === 'game'
      ? '游戏'
      : observation.contextKind === 'development'
        ? '开发'
        : observation.contextKind === 'prompt'
          ? '提示词'
          : '观察中',
    tone: uncertainty || !adviceAllowed ? 'uncertain' : 'ready',
    confidence,
    diagnostics: toDiagnostics(observation),
    verification: toVerification(observation),
    freshness,
  };
}
