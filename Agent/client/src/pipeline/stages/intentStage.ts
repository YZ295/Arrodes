/**
 * 意图检测阶段
 *
 * 输入：用户文本
 * 输出：识别到的意图（可能为 null）
 * 如果意图是本地可处理的，此阶段将设置 context.state 并提前终止管道
 */
import type { StageConfig, StageInput, StageOutput, IntentDetectionOutput } from '@shared/types/pipeline';
import {
  detectIntent,
  isLocalOnlyIntent,
  isEventDrivenIntent,
  getIntentLocalReply,
} from '../../voice/utils/intentDetector';

export function createIntentStage(): StageConfig<string, IntentDetectionOutput> {
  return {
    name: 'intent',
    timeout: 2000,
    continueOnError: true,

    processor: async (input: StageInput<string>): Promise<StageOutput<IntentDetectionOutput>> => {
      const text = input.context.rawInput || input.previousOutput || '';

      const detection = detectIntent(text);
      const output: IntentDetectionOutput = {
        intent: detection.intent,
        isLocalIntent: false,
      };

      if (detection.matched && detection.intent) {
        // 注入意图到上下文
        input.context.state.intent = detection.intent;

        if (isLocalOnlyIntent(detection.intent.type)) {
          output.isLocalIntent = true;
          const reply = getIntentLocalReply(detection.intent.type, detection.intent.params);
          if (reply) {
            input.context.state.reply = reply;
          }
          // 本地意图 → 停止管道，不调 LLM
          return { data: output, continue: false, duration: 0 };
        }

        if (isEventDrivenIntent(detection.intent.type)) {
          output.isLocalIntent = true;
          const reply = getIntentLocalReply(detection.intent.type, detection.intent.params);
          if (reply) {
            input.context.state.reply = reply;
          }
          return { data: output, continue: false, duration: 0 };
        }
      }

      return { data: output, continue: true, duration: 0 };
    },
  };
}
