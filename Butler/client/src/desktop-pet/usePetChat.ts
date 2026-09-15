/**
 * 桌宠对话（步骤 2）
 *
 * 复用现有基础设施：
 * - MessageChannel 单例（Vite 代理注入本地访问凭据，与主窗口同协议）
 * - useTTS（服务端 TTS 播报回复）
 * - useVoiceRecorder（按住说话：录音 → /api/v1/stt/transcribe 转写）
 *
 * 桌宠拥有独立会话，不污染主窗口的对话历史。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageChannel } from '../core/MessageChannel';
import { uid } from '../shared/utils/uid';
import { useTTS } from '../voice/hooks/useTTS';
import { useVoiceRecorder } from '../voice/hooks/useVoiceRecorder';
import { useVAD } from '../modules/voice/useVAD';

export interface PetChatMessage {
  id: string;
  role: 'user' | 'pet';
  content: string;
}

export interface PetChatController {
  messages: PetChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  thinking: boolean;
  error: string | null;
  sendDraft: () => Promise<void>;
  /** 按住说话 */
  recording: boolean;
  startVoice: () => void;
  stopVoice: () => Promise<void>;
  /** 免提（always-on）模式：VAD 自动启停录音 */
  handsFree: boolean;
  setHandsFree: (on: boolean) => void;
  /** VAD 是否在监听 */
  listening: boolean;
  /** 实时拾音音量（0~255，可视化用） */
  vadLevel: number;
  /** pet 是否正在播报（球体点击打断的分支依据） */
  speaking: boolean;
  /** 麦克风静音（会话级安全开关，不持久化）：true 时 VAD 停止采集 */
  micMuted: boolean;
  toggleMicMuted: () => void;
  /** 打断：立即停止播报并放弃等待中的回复（保留已到的部分文本） */
  interrupt: () => void;
  /** 最近一次语音交互时间戳（T7：30s 无话回归在场态） */
  lastVoiceActivityAt: number | null;
}

const CHAT_SESSION_TITLE = '桌宠对话';
const MAX_CHAT_HISTORY = 6;

async function ensurePetSession(): Promise<string> {
  const key = 'arrodes_desktop_pet_session';
  const stored = localStorage.getItem(key);
  if (stored) {
    const check = await fetch(`/api/v1/sessions/${stored}`);
    if (check.ok) return stored;
    localStorage.removeItem(key);
  }
  const res = await fetch('/api/v1/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: CHAT_SESSION_TITLE, topic: 'other' }),
  });
  if (!res.ok) throw new Error(`创建会话失败（${res.status}）`);
  const session = await res.json() as { id?: string };
  if (!session.id) throw new Error('创建会话失败：服务端未返回会话 id');
  localStorage.setItem(key, session.id);
  return session.id;
}

export function usePetChat(enabled: boolean): PetChatController {
  const [messages, setMessages] = useState<PetChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const tts = useTTS();
  // T7：最近一次语音交互时间戳（30s 无话回归在场态的依据）
  const [lastVoiceActivityAt, setLastVoiceActivityAt] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const channel = MessageChannel.getInstance();
    channel.connect();
    return () => { /* 由使用方统一管理生命周期，保持单例连接 */ };
  }, [enabled]);

  const sendText = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || thinking) return;
    setError(null);
    setThinking(true);
    setDraft('');
    setLastVoiceActivityAt(Date.now());
    const userMessage: PetChatMessage = { id: uid(), role: 'user', content: trimmed };
    setMessages((prev) => [...prev.slice(-MAX_CHAT_HISTORY), userMessage]);

    try {
      const sessionId = sessionRef.current ?? await ensurePetSession();
      sessionRef.current = sessionId;

      const channel = MessageChannel.getInstance();
      if (!channel.isConnected()) throw new Error('对话连接尚未就绪，请稍后重试');
      const requestId = channel.nextRequestId();
      // T4 打断句柄：interrupt 时放弃等待（保留已收到的部分内容）
      let cancelReply: (() => void) | null = null;
      pendingCancelRef.current = () => cancelReply?.();
      const replyPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('回复超时'));
        }, 60_000);
        const unsubscribe = channel.subscribe(requestId, {
          onChunk: (data) => {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === 'pet' && last.id === requestId) {
                return [...prev.slice(0, -1), { ...last, content: last.content + data.content }];
              }
              return [...prev, { id: requestId, role: 'pet', content: data.content }];
            });
          },
          onComplete: (data) => {
            clearTimeout(timeout);
            unsubscribe();
            setLastVoiceActivityAt(Date.now());
            setMessages((prev) => [...prev.filter((message) => message.id !== requestId), { id: requestId, role: 'pet', content: data.content }]);
            resolve(data.content);
          },
          onError: () => {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error('对话服务返回错误'));
          },
          onStopped: () => {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error('回复已停止'));
          },
        });
        channel.send({ type: 'message', sessionId, content: trimmed, isVoice: false, requestId });
        cancelReply = () => resolve('');
      });

      const reply = await replyPromise;
      if (reply.trim()) void tts.speak(reply).catch(() => { /* 播报失败不打断对话 */ });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '对话失败');
    } finally {
      pendingCancelRef.current = null;
      setThinking(false);
    }
  }, [thinking, tts]);

  // T4 打断：立即停播 + 放弃等待中的回复（部分内容保留，不视为错误）
  const pendingCancelRef = useRef<(() => void) | null>(null);
  const interrupt = useCallback(() => {
    tts.stop();
    const cancel = pendingCancelRef.current;
    if (cancel) {
      pendingCancelRef.current = null;
      cancel();
    }
  }, [tts]);

  const sendDraft = useCallback(async () => {
    await sendText(draft);
  }, [draft, sendText]);

  // T6 隐私约束：免提（always-on）链路强制本地 faster-whisper 识别，音频不出本机；
  // 显式 local 模式在服务端无云端回落（sttService 分支保证）
  const recorder = useVoiceRecorder({
    sendMessage: (content) => { void sendText(content); },
    getSessionId: () => sessionRef.current,
    sttProvider: 'local',
  });

  // ---- T2 免提（always-on VAD）----
  const [handsFree, setHandsFreeState] = useState<boolean>(() => {
    try { return localStorage.getItem('arrodes_pet_handsfree') !== '0'; } catch { return true; }
  });
  const setHandsFree = useCallback((on: boolean) => {
    setHandsFreeState(on);
    try { localStorage.setItem('arrodes_pet_handsfree', on ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  // 防自抢话：thinking 期间不触发；录音启停用自管理 ref（不依赖渲染时序的 isRecording 快照）
  const guardRef = useRef({ thinking: false });
  guardRef.current = { thinking };
  const recordingActiveRef = useRef(false);

  const vad = useVAD({
    // 免提阈值：略高于全局默认（15），startFrames 收紧到 4 帧（~100ms）减少首字裁切
    threshold: 18,
    startFrames: 4,
    endFrames: 30,
    onSpeechStart: () => {
      if (guardRef.current.thinking) return;
      recordingActiveRef.current = true;
      recorder.startRecording();
    },
    onSpeechEnd: () => {
      if (!recordingActiveRef.current) return;
      recordingActiveRef.current = false;
      recorder.stopRecording();
    },
  });

  // T3 半双工回声治理：pet 播报期间挂起 VAD；若挂起时正在录音则丢弃（不提交）
  const ttsSpeaking = tts.isSpeaking;
  // T4 麦克风安全开关（会话级，不持久化）
  const [micMuted, setMicMuted] = useState(false);
  const toggleMicMuted = useCallback(() => { setMicMuted((prev) => !prev); }, []);
  const vadActive = enabled && handsFree && !thinking && !ttsSpeaking && !micMuted;
  useEffect(() => {
    if (!vadActive) {
      if (recordingActiveRef.current) {
        recordingActiveRef.current = false;
        recorder.abortRecording();
      }
      vad.stop();
      return;
    }
    void vad.start();
    return () => { vad.stop(); };
    // vad.start/vad.stop 引用稳定（useCallback [cleanup]）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vadActive]);

  const startVoice = useCallback(() => {
    setError(null);
    recorder.startRecording();
  }, [recorder]);

  const stopVoice = useCallback(async () => {
    recorder.stopRecording();
  }, [recorder]);

  return {
    messages,
    draft,
    setDraft,
    thinking,
    error,
    sendDraft,
    recording: recorder.isRecording,
    startVoice,
    stopVoice,
    handsFree,
    setHandsFree,
    listening: vad.isRunning,
    vadLevel: vad.level,
    speaking: ttsSpeaking,
    micMuted,
    toggleMicMuted,
    interrupt,
    lastVoiceActivityAt,
  };
}
