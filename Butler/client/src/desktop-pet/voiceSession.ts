/**
 * T7 语音会话状态机（纯函数）
 *
 * 在场陪伴的表达核心：muted > thinking > speaking > listening > ambient。
 * 30s 无话自动回归 ambient（静默在场）——VAD 是否运行与本状态解耦：
 * 免提常开时 ambient 表示"听着但不打扰"。
 */

export type VoiceSessionState = 'ambient' | 'listening' | 'thinking' | 'speaking' | 'muted';

/** 对话余温：最后一次语音交互后保持 listening 的时长 */
export const VOICE_SESSION_IDLE_MS = 30_000;

export interface VoiceSessionInput {
  micMuted: boolean;
  thinking: boolean;
  speaking: boolean;
  /** 录音进行中（用户正在说话） */
  recording: boolean;
  /** VAD 是否在监听（仅用于调试展示，不参与优先级） */
  listening?: boolean;
  /** 最近一次语音交互时间戳（sendMessage 或回复完成时刷新）；null = 从未 */
  lastVoiceActivityAt: number | null;
  nowMs: number;
}

export function resolveVoiceSessionState(input: VoiceSessionInput): VoiceSessionState {
  if (input.micMuted) return 'muted';
  if (input.thinking) return 'thinking';
  if (input.speaking) return 'speaking';
  if (input.recording) return 'listening';
  if (
    input.lastVoiceActivityAt !== null
    && input.nowMs - input.lastVoiceActivityAt < VOICE_SESSION_IDLE_MS
  ) {
    return 'listening';
  }
  return 'ambient';
}
