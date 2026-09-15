/**
 * VAD Hook — 语音活动检测
 *
 * 参考 AIRI 的 VAD 流水线第一段。
 * 用 Web Audio API 的 AnalyserNode 实时分析音量，
 * 自动检测说话开始/结束，替代手动按键录音。
 *
 * 核心算法：
 * - 持续采样音量（RMS）
 * - 超过阈值 N 帧 → 判定为说话开始
 * - 低于阈值 M 帧 → 判定为说话结束
 *
 * 用法：
 * ```ts
 * const { isSpeaking, start, stop } = useVAD(stream, {
 *   onSpeechStart: () => console.log('开始说话'),
 *   onSpeechEnd: () => console.log('停止说话'),
 * });
 * ```
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { AudioContextManager } from './AudioContextManager';

// ===== 类型 =====

export interface VadConfig {
  /** 音量阈值（0~255，默认 15） */
  threshold?: number;
  /** 触发开始需连续超过阈值的帧数（默认 8 帧 ≈ 200ms） */
  startFrames?: number;
  /** 触发结束需连续低于阈值的帧数（默认 25 帧 ≈ 600ms） */
  endFrames?: number;
  /** 采样间隔 ms（默认 25ms → 40fps） */
  sampleInterval?: number;
  /** 分析器 FFT size（默认 256） */
  fftSize?: number;
  /** 开始说话回调 */
  onSpeechStart?: () => void;
  /** 停止说话回调 */
  onSpeechEnd?: () => void;
  /** 音量变化回调（用于可视化） */
  onLevelChange?: (level: number) => void;
}

export interface UseVadReturn {
  /** 是否正在说话 */
  isSpeaking: boolean;
  /** 当前音量值（0~255） */
  level: number;
  /** 开始检测 */
  start: () => Promise<void>;
  /** 停止检测 */
  stop: () => void;
  /** VAD 是否在运行 */
  isRunning: boolean;
}

// ===== 默认配置 =====

const DEFAULTS: Required<Omit<VadConfig, 'onSpeechStart' | 'onSpeechEnd' | 'onLevelChange'>> = {
  threshold: 15,
  startFrames: 8,
  endFrames: 25,
  sampleInterval: 25,
  fftSize: 256,
};

// ===== Hook =====

export function useVAD(config: VadConfig = {}): UseVadReturn {
  const {
    threshold = DEFAULTS.threshold,
    startFrames = DEFAULTS.startFrames,
    endFrames = DEFAULTS.endFrames,
    sampleInterval = DEFAULTS.sampleInterval,
    fftSize = DEFAULTS.fftSize,
    onSpeechStart,
    onSpeechEnd,
    onLevelChange,
  } = config;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aboveCount = useRef(0);
  const belowCount = useRef(0);
  const speakingRef = useRef(false);
  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd, onLevelChange });
  callbacksRef.current = { onSpeechStart, onSpeechEnd, onLevelChange };

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    analyserRef.current = null;
    dataRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    aboveCount.current = 0;
    belowCount.current = 0;
    speakingRef.current = false;
    setIsSpeaking(false);
    setLevel(0);
    setIsRunning(false);
  }, []);

  const start = useCallback(async () => {
    cleanup();

    try {
      const acm = AudioContextManager.getInstance();
      await acm.ensureResumed();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const source = acm.createSourceNode(stream);
      const analyser = acm.createAnalyser(fftSize);
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      dataRef.current = dataArray;

      aboveCount.current = 0;
      belowCount.current = 0;
      speakingRef.current = false;
      setIsRunning(true);

      // 定时采样
      timerRef.current = setInterval(() => {
        if (!analyserRef.current || !dataRef.current) return;

        analyserRef.current.getByteFrequencyData(dataRef.current);

        // 计算平均音量
        let sum = 0;
        for (let i = 0; i < dataRef.current.length; i++) {
          sum += dataRef.current[i];
        }
        const avg = sum / dataRef.current.length;

        setLevel(Math.floor(avg));
        callbacksRef.current.onLevelChange?.(avg);

        // VAD 状态机
        if (avg > threshold) {
          aboveCount.current++;
          belowCount.current = 0;

          if (!speakingRef.current && aboveCount.current >= startFrames) {
            speakingRef.current = true;
            setIsSpeaking(true);
            callbacksRef.current.onSpeechStart?.();
          }
        } else {
          belowCount.current++;
          aboveCount.current = 0;

          if (speakingRef.current && belowCount.current >= endFrames) {
            speakingRef.current = false;
            setIsSpeaking(false);
            callbacksRef.current.onSpeechEnd?.();
          }
        }
      }, sampleInterval);
    } catch (err) {
      console.error('[useVAD] 启动失败:', err);
      cleanup();
    }
  }, [threshold, startFrames, endFrames, sampleInterval, fftSize, cleanup]);

  const stop = useCallback(cleanup, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { isSpeaking, level, start, stop, isRunning };
}
