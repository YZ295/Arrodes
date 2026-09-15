/**
 * T7/T9 语音会话状态 Hook：1s ticker 驱动 30s 回归判定
 * （ticker 常驻，代价一次 setState/秒；只在桌宠窗口运行）
 */
import { useEffect, useState } from 'react';
import { resolveVoiceSessionState, type VoiceSessionState } from './voiceSession';

export interface VoiceSessionChatSnapshot {
  micMuted: boolean;
  thinking: boolean;
  speaking: boolean;
  recording: boolean;
  lastVoiceActivityAt: number | null;
}

export function useVoiceSessionState(chat: VoiceSessionChatSnapshot): VoiceSessionState {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return resolveVoiceSessionState({
    micMuted: chat.micMuted,
    thinking: chat.thinking,
    speaking: chat.speaking,
    recording: chat.recording,
    lastVoiceActivityAt: chat.lastVoiceActivityAt,
    nowMs,
  });
}
