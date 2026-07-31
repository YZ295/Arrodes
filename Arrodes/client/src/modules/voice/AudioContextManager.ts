/**
 * AudioContext 管理器（单例）
 *
 * 参考 AIRI 的 WebAudio 优先架构：
 * - 全局唯一 AudioContext，避免浏览器限制
 * - 自动管理 suspend/resume 生命周期（浏览器自动播放策略）
 * - 提供标准化的 AudioNode 创建方法
 *
 * 用法：
 * ```ts
 * const acm = AudioContextManager.getInstance();
 * await acm.ensureResumed(); // 用户交互后恢复
 * const source = acm.createSourceNode(stream);
 * ```
 */
export class AudioContextManager {
  private static instance: AudioContextManager;
  private ctx: AudioContext | null = null;

  static getInstance(): AudioContextManager {
    if (!AudioContextManager.instance) {
      AudioContextManager.instance = new AudioContextManager();
    }
    return AudioContextManager.instance;
  }

  private constructor() {}

  /** 获取或创建 AudioContext */
  getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({
        sampleRate: 16000, // 语音识别推荐采样率
        latencyHint: 'interactive',
      });
    }
    return this.ctx;
  }

  /** 确保 AudioContext 处于 running 状态（用户交互后可调用） */
  async ensureResumed(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  /** 挂起（节省资源） */
  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running') {
      await this.ctx.suspend();
    }
  }

  /** 关闭并释放资源 */
  async close(): Promise<void> {
    if (this.ctx && this.ctx.state !== 'closed') {
      await this.ctx.close();
      this.ctx = null;
    }
  }

  /** 从 MediaStream 创建音频源节点 */
  createSourceNode(stream: MediaStream): MediaStreamAudioSourceNode {
    return this.getContext().createMediaStreamSource(stream);
  }

  /** 创建分析器节点（用于 VAD/可视化） */
  createAnalyser(fftSize = 256): AnalyserNode {
    const analyser = this.getContext().createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.4;
    return analyser;
  }

  /** 获取当前状态 */
  get state(): AudioContextState {
    return this.ctx?.state ?? 'closed';
  }
}
