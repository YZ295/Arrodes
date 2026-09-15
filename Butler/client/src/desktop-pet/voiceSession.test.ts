// T7 回归锁定：语音会话状态机（纯函数，时钟可注入）
// 优先级：muted > thinking > speaking > listening(录音中/30s余温) > ambient
import { describe, expect, it } from 'vitest';
import { resolveVoiceSessionState, VOICE_SESSION_IDLE_MS } from './voiceSession';

const BASE = {
  micMuted: false,
  thinking: false,
  speaking: false,
  recording: false,
  lastVoiceActivityAt: null as number | null,
  nowMs: 1_000_000,
};

describe('resolveVoiceSessionState（T7）', () => {
  it('muted 优先级最高（micMuted 压过 thinking/speaking）', () => {
    expect(resolveVoiceSessionState({ ...BASE, micMuted: true, thinking: true, speaking: true })).toBe('muted');
  });

  it('thinking 次之', () => {
    expect(resolveVoiceSessionState({ ...BASE, thinking: true, speaking: true })).toBe('thinking');
  });

  it('speaking 再次', () => {
    expect(resolveVoiceSessionState({ ...BASE, speaking: true })).toBe('speaking');
  });

  it('录音中 → listening', () => {
    expect(resolveVoiceSessionState({ ...BASE, recording: true })).toBe('listening');
  });

  it('30s 内有语音活动 → listening（对话余温）', () => {
    expect(resolveVoiceSessionState({
      ...BASE,
      lastVoiceActivityAt: BASE.nowMs - (VOICE_SESSION_IDLE_MS - 1),
    })).toBe('listening');
  });

  it('30s 无话 → 回归 ambient（静默在场，VAD 仍可运行）', () => {
    expect(resolveVoiceSessionState({
      ...BASE,
      listening: true,
      lastVoiceActivityAt: BASE.nowMs - VOICE_SESSION_IDLE_MS,
    })).toBe('ambient');
  });

  it('从未有过语音活动 → ambient', () => {
    expect(resolveVoiceSessionState(BASE)).toBe('ambient');
  });

  it('VAD 关闭（免提关）且无活动 → ambient', () => {
    expect(resolveVoiceSessionState({ ...BASE, listening: false })).toBe('ambient');
  });
});
