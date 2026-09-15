/**
 * 语音转文字 Hook
 * 封装浏览器原生 SpeechRecognition API
 */
import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Local declarations for Web Speech API SpeechRecognition.
 * Not available in TypeScript 6.0 DOM lib but present in modern browsers.
 */
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new(): SpeechRecognition;
}

interface UseSpeechToTextReturn {
  isListening: boolean;
  interimText: string;
  startListening: () => Promise<string>;
  stopListening: () => void;
  error: string | null;
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const SpeechRecognitionAPI =
    (window as unknown as { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
  return SpeechRecognitionAPI ?? null;
}

export function useSpeechToText(): UseSpeechToTextReturn {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const resolveRef = useRef<((value: string) => void) | null>(null);
  const rejectRef = useRef<((reason: Error) => void) | null>(null);
  const retryCountRef = useRef(0);
  const finalTextRef = useRef(''); // 避免闭包陷阱：存最终文本

  const cleanup = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore abort errors
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimText('');
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped
      }
    }
    cleanup();
  }, [cleanup]);

  const startListening = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const SpeechRecognitionAPI = getSpeechRecognition();
      if (!SpeechRecognitionAPI) {
        const err = new Error('SPEECH_NOT_SUPPORTED');
        setError('浏览器不支持语音识别');
        reject(err);
        return;
      }

      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch { /* ignore */ }
      }

      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'zh-CN';
      recognition.continuous = true; // 持续监听，不自动停止
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognitionRef.current = recognition;
      resolveRef.current = resolve;
      rejectRef.current = reject;
      retryCountRef.current = 0;
      finalTextRef.current = ''; // 重置

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalText += result[0].transcript;
            finalTextRef.current += result[0].transcript; // 累积到 ref
          } else {
            setInterimText((prev) => prev + result[0].transcript);
          }
        }
        if (finalText) {
          setInterimText(''); // 清空临时文本，显示确认文本
          // 不在此 resolve，等 onend 统一处理
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech' && retryCountRef.current < 1) {
          retryCountRef.current++;
          try { recognition.start(); } catch { /* ignore */ }
          return;
        }
        let errorMsg: string;
        switch (event.error) {
          case 'not-allowed': errorMsg = '麦克风权限被拒绝'; break;
          case 'no-speech': errorMsg = '未检测到语音'; break;
          case 'audio-capture': errorMsg = '未找到麦克风'; break;
          case 'network': errorMsg = '网络错误'; break;
          case 'aborted': errorMsg = '识别已取消'; break;
          default: errorMsg = '语音识别失败';
        }
        setError(errorMsg);
        reject(new Error(errorMsg));
        cleanup();
      };

      recognition.onend = () => {
        // 用 ref 中累积的最终文本（避免闭包陷阱）
        const finalText = finalTextRef.current || '';
        setInterimText('');
        finalTextRef.current = '';
        resolve(finalText);
        cleanup();
      };

      try {
        setIsListening(true);
        setError(null);
        recognition.start();
      } catch (err) {
        setError('无法启动语音识别');
        reject(new Error('无法启动语音识别'));
        cleanup();
      }
    });
  }, [cleanup]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isListening,
    interimText,
    startListening,
    stopListening,
    error,
  };
}