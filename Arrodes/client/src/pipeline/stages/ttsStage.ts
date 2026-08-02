/**
 * TTS 合成阶段
 *
 * 从 context.state.reply 读取 AI 回复文本，调用 TTS 播放。
 * 非关键阶段：失败不影响管道结果。
 */
import type { StageConfig, StageInput, StageOutput } from '@shared/types/pipeline';

export type TtsStageDeps = {
  speak: (text: string) => Promise<void>;
};

export function createTtsStage(deps: TtsStageDeps): StageConfig<string, void> {
  return {
    name: 'tts',
    timeout: 15000,
    continueOnError: true, // TTS 失败不阻断管道

    processor: async (input: StageInput<string>): Promise<StageOutput<void>> => {
      const text = (input.context.state.reply as string) || input.previousOutput || '';
      if (!text) return { data: undefined, continue: true, duration: 0 };

      await deps.speak(text);
      return { data: undefined, continue: true, duration: 0 };
    },
  };
}
