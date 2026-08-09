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
}

/**
 * @param deps.sendMessage 录音结束转录成功后调用（内容 + isVoice=true）
 * @param deps.getSessionId 获取当前会话 id（录音归属会话）
 */
export function useVoiceRecorder(deps: {
  sendMessage: (content: string, isVoice: boolean) => void;
  getSessionId: () => string | null;
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

  // 服务端语音识别（录音 Blob 上传）
  const serverTranscribe = useCallback(async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
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
    startAudioRecorder().catch(() => {});
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

    stopAudioRecorder().then((audioBlob) => {
      const fallback = (text: string) => {
        deps.sendMessage(text, true);
        eventBus.emit(EVENTS.VOICE_RECORDING_END, { text, sessionId: deps.getSessionId() });
      };

      if (audioBlob && audioBlob.size > 0) {
        serverTranscribe(audioBlob)
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

  return {
    isRecording,
    recordingDuration,
    recordingVolume,
    interimText,
    error,
    startRecording,
    stopRecording,
  };
}
