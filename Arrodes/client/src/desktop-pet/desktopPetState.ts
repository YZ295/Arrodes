import type { VisionObservation } from '../modules/vision/continuousVision';

export interface DesktopPetSnapshot {
  active: boolean;
  analyzing: boolean;
  error: string | null;
  observation: VisionObservation | null;
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

export function createDesktopPetViewModel(
  observation: VisionObservation | null,
  runtime: Omit<DesktopPetSnapshot, 'observation'>,
): DesktopPetViewModel {
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
    };
  }

  if (!runtime.active) {
    return {
      title: '阿罗德斯已待命',
      state: '在主窗口开启屏幕观察后，我会在画面明显变化时更新。',
      action: null,
      note: '屏幕不会在未授权时被采集。',
      status: '未观察',
      tone: 'idle',
      confidence: null,
      diagnostics: null,
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
  };
}
