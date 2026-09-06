/**
 * TTS 合成阶段
 *
 * 从 context.state.reply 读取 AI 回复文本，调用 TTS 播放。
 * 非关键阶段：失败不影响管道结果。
 *
 * 中断机制：context.state.generation 记录消息代际，
 * 播放前对比全局代际，若已被新消息取代则跳过（防止旧回复继续发声）。
 */
import type { StageConfig, StageInput, StageOutput } from '@shared/types/pipeline';
import { getVoiceGeneration } from '../../shared/utils/voiceGeneration';

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

      // 代际检查：如果这条消息已被新消息取代，跳过播放
      const msgGeneration = (input.context.state.generation as number) ?? -1;
      if (msgGeneration >= 0 && msgGeneration !== getVoiceGeneration()) {
        console.log(`[TTS] 消息代际 ${msgGeneration} != 当前 ${getVoiceGeneration()}，跳过旧回复语音`);
        return { data: undefined, continue: true, duration: 0 };
      }

      await deps.speak(text);
      return { data: undefined, continue: true, duration: 0 };
    },
  };
}
