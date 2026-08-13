/**
 * useWakeWord：唤醒词监听 Hook
 *
 * 使用浏览器 SpeechRecognition（continuous + interim）持续监听，
 * 命中「嘿/嗨 阿罗德斯」时回调 onWake，并暂停自身监听。
 * Electron 壳内若 SpeechRecognition 不可用，isSupported 为 false。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchWakePhrase } from '../utils/wakeWord';

export interface WakeWordApi {
  isListening: boolean;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
}

export function useWakeWord(onWake: () => void): WakeWordApi {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  });

  const activeRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const abort = useCallback(() => {
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
  }, []);

  const runRecognition = useCallback(() => {
    if (!activeRef.current) return;
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      if (matchWakePhrase(text)) {
        onWakeRef.current();
        abort();
      }
    };

    recognition.onerror = () => {
      // 忽略；onend 会按 active 状态决定是否重启
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (activeRef.current) {
        setTimeout(runRecognition, 300);
      }
    };

    try {
      recognition.start();
    } catch {
      // ignore
    }
  }, [abort]);

  const start = useCallback(() => {
    if (!isSupported || activeRef.current) return;
    activeRef.current = true;
    setIsListening(true);
    runRecognition();
  }, [isSupported, runRecognition]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setIsListening(false);
    abort();
  }, [abort]);

  useEffect(() => stop, [stop]);

  return { isListening, isSupported, start, stop };
}
