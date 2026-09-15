/**
 * 音频电平共享 Store
 *
 * 连接语音 hooks 和 3D 场景：
 * - useAudioRecorder 写入 inputLevel（用户说话音量）
 * - useTTS 写入 outputLevel（阿罗德斯播放音量）
 * - AudioParticles 3D 组件读取两者驱动粒子动画
 */
import { create } from 'zustand';

export type AudioMode = 'idle' | 'recording' | 'speaking';

interface AudioLevelState {
  /** 用户输入音量 0~255 */
  inputLevel: number;
  /** 阿罗德斯输出音量 0~255 */
  outputLevel: number;
  /** 当前音频模式 */
  mode: AudioMode;

  setInputLevel: (level: number) => void;
  setOutputLevel: (level: number) => void;
  setMode: (mode: AudioMode) => void;
  /** 获取当前活跃音量（输入或输出中较大者） */
  getActiveLevel: () => number;
}

export const useAudioLevelStore = create<AudioLevelState>((set, get) => ({
  inputLevel: 0,
  outputLevel: 0,
  mode: 'idle',

  setInputLevel: (level) => set({ inputLevel: Math.min(255, Math.max(0, level)) }),
  setOutputLevel: (level) => set({ outputLevel: Math.min(255, Math.max(0, level)) }),
  setMode: (mode) => set({ mode }),

  getActiveLevel: () => {
    const { inputLevel, outputLevel, mode } = get();
    if (mode === 'recording') return inputLevel;
    if (mode === 'speaking') return outputLevel;
    return Math.max(inputLevel, outputLevel);
  },
}));
