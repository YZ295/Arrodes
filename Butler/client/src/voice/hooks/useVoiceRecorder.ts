/**
 * useVoiceRecorder：录音 + 语音识别 Hook（T10 拆分自 useVoiceChat）
 *
 * 职责：录音启停、浏览器实时 STT（Electron 内跳过）、服务端 STT 转录、
 * 转录结果回退链（服务端 → 浏览器 STT → 占位文本）。
 *
 * 依赖注入：sendMessage 回调（录音结束且转录出文本后调用，避免循环依赖）。
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { eventBus, EVENTS } from '../../shared/events/EventBus';
import { useAudioRecorder } from './useAudioRecorder';
import { useSpeechToText } from './useSpeechToText';

export interface VoiceRecorderApi {
  isRecording: boolean;
  recordingDuration: number;
  recordingVolume: number;
  interimText: string;
  /** 录音器/STT 聚合错误 */
  error: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  /** 丢弃当前录音（不提交不播报）：半双工回声治理用（T3） */
  abortRecording: () => void;
}

/**
 * @param deps.sendMessage 录音结束转录成功后调用（内容 + isVoice=true）
 * @param deps.getSessionId 获取当前会话 id（录音归属会话）
 * @param deps.sttProvider 强制 STT 模式（T6：桌宠免提链路传 'local'，音频不出本机；
 *   缺省跟随服务端持久化模式，主窗口行为不变）
 */
export function useVoiceRecorder(deps: {
  sendMessage: (content: string, isVoice: boolean) => void;
  getSessionId: () => string | null;
  sttProvider?: 'local' | 'online' | 'auto';
}): VoiceRecorderApi {
  const {
    isRecording, duration: recordingDuration, volume: recordingVolume,
    startRecording: startAudioRecorder, stopRecording: stopAudioRecorder,
    error: recorderError,
  } = useAudioRecorder();

  const {
    interimText, startListening: startStt, stopListening: stopStt, error: sttError,
  } = useSpeechToText();

  const [error, setError] = useState<string | null>(null);
  const sttPromiseRef = useRef<Promise<string> | null>(null);
  // 录音器是否成功启动（防幻影：未成功录音时 stopRecording 直接 no-op）
  const recorderActiveRef = useRef(false);

  useEffect(() => {
    if (recorderError) {
      console.warn('[VoiceRecorder] 录音器异常:', recorderError);
      setError(recorderError);
    }
  }, [recorderError]);
  useEffect(() => {
    if (sttError) {
      console.warn('[VoiceRecorder] 语音识别异常:', sttError);
      setError(sttError);
    }
  }, [sttError]);

  // 服务端语音识别（录音 Blob 上传；provider 非空时服务端按此模式识别）
  const serverTranscribe = useCallback(async (blob: Blob, provider?: 'local' | 'online' | 'auto'): Promise<string> => {
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    if (provider) form.append('provider', provider);
    const res = await fetch('/api/v1/stt/transcribe', { method: 'POST', body: form });
    if (!res.ok) throw new Error(`服务端语音识别失败 (${res.status})`);
    const data = await res.json() as { text?: string };
    return (data.text || '').trim();
  }, []);

  // 回退：浏览器实时 STT 结果（无则占位文本）
  const fallbackToStt = useCallback((sttPromise: Promise<string> | null, fallback: (text: string) => void) => {
    (sttPromise || Promise.resolve('')).then((sttText) => {
      const text = sttText && sttText.length > 2 ? sttText : '[语音消息]';
      fallback(text);
    });
  }, []);

  const startRecording = useCallback(() => {
    startAudioRecorder().then(() => { recorderActiveRef.current = true; }).catch(() => {});
    // Electron 壳内浏览器 SpeechRecognition 不可用（报 network 错误），
    // 直接跳过实时 STT，靠 stopRecording 时的录音上传服务端识别。
    const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
    sttPromiseRef.current = isElectron ? Promise.resolve('') : startStt().catch(() => '');
    eventBus.emit(EVENTS.VOICE_RECORDING_START);
  }, [startAudioRecorder, startStt]);

  const stopRecording = useCallback(() => {
    const sttPromise = sttPromiseRef.current;
    sttPromiseRef.current = null;
    stopStt();

    // 未成功开始录音（权限拒绝/启动失败）：直接跳过，防发送幻影 [语音消息]
    if (!recorderActiveRef.current) return;
    recorderActiveRef.current = false;

    stopAudioRecorder().then((audioBlob) => {
      const fallback = (text: string) => {
        deps.sendMessage(text, true);
        eventBus.emit(EVENTS.VOICE_RECORDING_END, { text, sessionId: deps.getSessionId() });
      };

      if (audioBlob && audioBlob.size > 0) {
        serverTranscribe(audioBlob, deps.sttProvider)
          .then((text) => {
            if (text) { fallback(text); return; }
            fallbackToStt(sttPromise, fallback);
          })
          .catch((err) => {
            console.warn('[VoiceRecorder] 服务端识别失败，回退浏览器 STT:', err);
            fallbackToStt(sttPromise, fallback);
          });
      } else {
        fallbackToStt(sttPromise, fallback);
      }
    });
  }, [stopAudioRecorder, stopStt, deps, serverTranscribe, fallbackToStt]);

  // 丢弃当前录音：不转写不提交（半双工回声治理——pet 播报时用户误入的半句人声不进对话）
  const abortRecording = useCallback(() => {
    sttPromiseRef.current = null;
    stopStt();
    if (!recorderActiveRef.current) return;
    recorderActiveRef.current = false;
    void stopAudioRecorder();
  }, [stopStt, stopAudioRecorder]);

  return {
    isRecording,
    recordingDuration,
    recordingVolume,
    interimText,
    error,
    startRecording,
    stopRecording,
    abortRecording,
  };
}
