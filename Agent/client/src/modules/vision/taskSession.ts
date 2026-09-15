/**
 * 最小屏幕任务闭环：任务会话 + 上一步验证
 *
 * 只做三件事（刻意保持最小，不引入新模型 / 自动点击 / 长期记忆）：
 *   1. 任务有明确的开始与停止（`active`）
 *   2. 每一轮观察产出「当前状态 + 唯一下一步 + 期望证据」
 *   3. 下一轮观察对照上一轮的期望证据，判定上一步是**成功 / 失败 / 待定**
 *
 * 状态只活在本次任务会话内，停止即丢弃——这不是记忆系统。
 */
import type { GuidanceDecision } from './screenGuidance';

/** 观察结果里本模块需要用到的最小字段（结构类型，避免与 continuousVision 循环依赖） */
export interface ObservableFrame {
  description: string;
  visibleText?: string[];
  decision?: GuidanceDecision;
  nextAction?: string | null;
  nextSuggestion?: string | null;
  currentStep?: string | null;
  currentState?: string | null;
  expectedEvidence?: string[];
  observedAt?: string;
}

export type TaskPhase = 'idle' | 'observing' | 'waiting-evidence' | 'advancing' | 'blocked';

export type VerificationResult = 'none' | 'confirmed' | 'failed' | 'pending';

export interface TaskVerification {
  result: VerificationResult;
  /** 上一轮期望看到的证据 */
  expected: string | null;
  /** 判定依据（人话，给管家直接显示） */
  basis: string;
}

export interface TaskSession {
  active: boolean;
  goal: string;
  phase: TaskPhase;
  /** 当前状态（管家第一行） */
  state: string | null;
  /** 唯一下一步（管家第二行） */
  nextAction: string | null;
  /** 本轮期望看到的证据，留给下一轮验证 */
  pendingEvidence: string[];
  verification: TaskVerification;
  /** 本轮观察序号，便于界面表达"第 N 次观察" */
  observationCount: number;
  updatedAt: string | null;
}

/** 给界面消费的精简任务视图（不把整段会话状态塞进观察结果） */
export interface TaskSessionView {
  active: boolean;
  phase: TaskPhase;
  state: string | null;
  nextAction: string | null;
  verification: TaskVerification;
  observationCount: number;
}

const NO_VERIFICATION: TaskVerification = {
  result: 'none',
  expected: null,
  basis: '这是本次任务的第一次观察，还没有上一步可验证。',
};

/** 生成界面视图 */
export function toSessionView(session: TaskSession): TaskSessionView {
  return {
    active: session.active,
    phase: session.phase,
    state: session.state,
    nextAction: session.nextAction,
    verification: session.verification,
    observationCount: session.observationCount,
  };
}

export function createTaskSession(goal = ''): TaskSession {
  return {
    active: false,
    goal: goal.trim(),
    phase: 'idle',
    state: null,
    nextAction: null,
    pendingEvidence: [],
    verification: NO_VERIFICATION,
    observationCount: 0,
    updatedAt: null,
  };
}

/** 用户明确开始任务 */
export function startTask(session: TaskSession, goal?: string): TaskSession {
  return {
    ...createTaskSession(goal ?? session.goal),
    active: true,
    phase: 'observing',
    verification: NO_VERIFICATION,
  };
}

/** 用户明确停止任务——之后不再观察、不再推理 */
export function stopTask(session: TaskSession): TaskSession {
  return {
    ...session,
    active: false,
    phase: 'idle',
    nextAction: null,
    pendingEvidence: [],
  };
}

function normalize(text: string | null | undefined): string | null {
  const value = text?.trim();
  return value ? value : null;
}

/**
 * 证据比对：期望文本是否是画面可见文字的一部分。
 * 去掉尾部标点后做子串匹配——保守、可解释，不做语义猜测。
 */
export function evidenceMatches(expected: string, visibleText: string[]): boolean {
  const haystack = visibleText.join('\n').toLowerCase();
  const needle = expected.trim().toLowerCase().replace(/[。.，,；;：:!！?？]+$/, '');
  return needle.length >= 3 && haystack.includes(needle);
}

/**
 * 判定上一步是否成功。
 * - 命中期望证据 → confirmed
 * - 未命中但画面出现需处理的错误 → failed
 * - 其余 → pending（继续等画面变化）
 */
export function verifyPreviousStep(
  expected: string[],
  visibleText: string[],
  decision: GuidanceDecision | undefined,
): TaskVerification {
  const first = expected[0]?.trim() || null;
  if (!first) return NO_VERIFICATION;

  if (evidenceMatches(first, visibleText)) {
    return {
      result: 'confirmed',
      expected: first,
      basis: `画面中出现了上一步期望的「${first}」，上一步已完成。`,
    };
  }
  if (decision === 'blocked') {
    return {
      result: 'failed',
      expected: first,
      basis: `上一步期望的「${first}」没有出现，且画面显示了需要处理的错误。`,
    };
  }
  return {
    result: 'pending',
    expected: first,
    basis: `还没有出现上一步期望的「${first}」，继续等待画面变化。`,
  };
}

/**
 * 把一轮新观察并入任务会话。
 *
 * 关键约束：只有 `advance` / `blocked` 这类**已经给出行动**的轮次才会留下待验证证据；
 * `wait` 轮次不产生"上一步"，避免把等待当成进展。
 */
export function applyTaskObservation(session: TaskSession, frame: ObservableFrame): TaskSession {
  if (!session.active) return session;

  const visibleText = frame.visibleText ?? [];
  const verification = verifyPreviousStep(session.pendingEvidence, visibleText, frame.decision);

  const nextAction = normalize(frame.nextAction) ?? normalize(frame.nextSuggestion);
  const state = normalize(frame.currentStep)
    ?? normalize(frame.currentState)
    ?? normalize(frame.description);

  const actionable = frame.decision === 'advance' || frame.decision === 'blocked';
  const phase: TaskPhase = frame.decision === 'blocked'
    ? 'blocked'
    : nextAction
      ? 'advancing'
      : 'waiting-evidence';

  return {
    ...session,
    phase,
    state,
    nextAction,
    pendingEvidence: actionable ? (frame.expectedEvidence ?? []) : [],
    verification,
    observationCount: session.observationCount + 1,
    updatedAt: frame.observedAt ?? new Date().toISOString(),
  };
}
