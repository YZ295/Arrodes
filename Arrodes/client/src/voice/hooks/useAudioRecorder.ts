/**
 * 增强音频录制 Hook
 *
 * 参考 AIRI 的 VAD 流水线和 WebAudio 优先架构：
 * - 噪声抑制（noiseSuppression）
 * - 自动增益控制（autoGainControl）
 * - 回声消除（echoCancellation）
 * - 录音时长追踪
 * - 音量级别实时反馈
 *
 * 用法：
 * ```ts
 * const { isRecording, duration, volume, startRecording, stopRecording } = useAudioRecorder();
 * ```
 */
import { useState, useRef, useCallback } from 'react';
import { AudioContextManager } from '../../modules/voice/AudioContextManager';
import { useAudioLevelStore } from '../../shared/stores/useAudioLevelStore';

// ===== 配置 =====

export interface RecorderConfig {
  /** 采样率（默认 16000，适合语音识别） */
  sampleRate?: number;
  /** 声道数（默认 1，单声道） */
  channelCount?: number;
  /** 降噪 */
  noiseSuppression?: boolean;
  /** 回声消除 */
  echoCancellation?: boolean;
  /** 自动增益 */
  autoGainControl?: boolean;
  /** MIME 类型（默认 audio/webm） */
  mimeType?: string;
}

// ===== 返回类型 =====

interface UseAudioRecorderReturn {
  isRecording: boolean;
  duration: number; // 秒
  volume: number;   // 0~255
  stream: MediaStream | null;
  startRecording: (config?: RecorderConfig) => Promise<void>;
  stopRecording: () => Promise<Blob | null>;
  error: string | null;
}

const DEFAULT_CONFIG: RecorderConfig = {
  sampleRate: 16000,
  channelCount: 1,
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
};

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (levelTimerRef.current) { clearInterval(levelTimerRef.current); levelTimerRef.current = null; }
    if (sourceRef.current) { try { sourceRef.current.disconnect(); } catch {} sourceRef.current = null; }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
    setDuration(0);
    setVolume(0);
    useAudioLevelStore.getState().setInputLevel(0);
    useAudioLevelStore.getState().setMode('idle');
  }, []);

  const startRecording = useCallback(async (config?: RecorderConfig) => {
    cleanup();
    setError(null);
    chunksRef.current = [];
    const cfg = { ...DEFAULT_CONFIG, ...config };

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: cfg.channelCount,
          sampleRate: cfg.sampleRate,
          echoCancellation: cfg.echoCancellation,
          noiseSuppression: cfg.noiseSuppression,
          autoGainControl: cfg.autoGainControl,
        },
      });
      streamRef.current = audioStream;
      setStream(audioStream);

      // 确定 MIME 类型
      const mimeType = cfg.mimeType || (
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4'
      );

      const recorder = new MediaRecorder(audioStream, {
        mimeType,
        audioBitsPerSecond: 48000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        audioStream.getTracks().forEach((t) => t.stop());
      };

      recorder.onerror = () => {
        setError('录制过程中出错');
        setIsRecording(false);
        cleanup();
      };

      recorder.start(250); // 每 250ms 收集一次数据
      mediaRecorderRef.current = recorder;
      startTimeRef.current = Date.now();

      // 音量分析（连接 AnalyserNode）
      try {
        const acm = AudioContextManager.getInstance();
        await acm.ensureResumed();
        const source = acm.createSourceNode(audioStream);
        const analyser = acm.createAnalyser(256);
        source.connect(analyser);
        sourceRef.current = source;
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        useAudioLevelStore.getState().setMode('recording');

        levelTimerRef.current = setInterval(() => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = Math.floor(sum / dataArray.length);
          setVolume(avg);
          useAudioLevelStore.getState().setInputLevel(avg);
        }, 50);
      } catch (e) {
        console.warn('[AudioRecorder] 音量分析初始化失败:', e);
      }

      // 计时器
      timerRef.current = setInterval(() => {
        setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 250);

      setIsRecording(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? '麦克风权限被拒绝'
          : '无法启动录音';
      setError(message);
      cleanup();
    }
  }, [cleanup]);

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false);
        cleanup();
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        const blob = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type: recorder.mimeType })
          : null;
        chunksRef.current = [];
        setIsRecording(false);
        cleanup();
        resolve(blob);
      };

      recorder.stop();
    });
  }, [cleanup]);

  return {
    isRecording,
    duration,
    volume,
    stream,
    startRecording,
    stopRecording,
    error,
  };
}
