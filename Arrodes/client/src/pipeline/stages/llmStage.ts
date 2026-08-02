/**
 * LLM 推理阶段
 *
 * 通过 MessageChannel 发送消息到服务端：
 * - 流式 chunks → 通过回调推送到 UI（不阻断管道）
 * - 等待 complete 消息 → resolve 管道阶段
 *
 * 设计关键：Promise 等待 complete，但 chunks 仍通过 MessageChannel 全局回调更新 UI。
 */
import type { StageConfig, StageInput, StageOutput, LlmInferenceOutput } from '@shared/types/pipeline';
import { MessageChannel } from '../../core/MessageChannel';

export function createLlmStage(): StageConfig<string, LlmInferenceOutput> {
  return {
    name: 'llm',
    timeout: 60000, // LLM 最长等待 60s
    continueOnError: false,

    processor: async (input: StageInput<string>): Promise<StageOutput<LlmInferenceOutput>> => {
      const channel = MessageChannel.getInstance();
      const sessionId = input.context.sessionId;
      const content = input.context.rawInput || '';
      const intentData = input.context.state.intent;

      if (!channel.isConnected()) {
        throw new Error('未连接到服务器');
      }

      // 发送消息（流式 chunks 由 MessageChannel 全局回调处理 UI）
      channel.send({
        type: 'message',
        sessionId,
        content,
        isVoice: !!input.context.audioBlob,
        ...(intentData ? { intent: intentData as any } : {}),
      });

      // 等待 complete 或 error
      return new Promise((resolve, reject) => {
        const startWait = Date.now();
        const MAX_WAIT = 50000; // 50s 兜底

        const onComplete = (data: { content: string }) => {
          cleanup();
          input.context.state.reply = data.content;
          resolve({
            data: { content: data.content, newMemories: [] },
            continue: true,
            duration: Date.now() - startWait,
          });
        };

        const onError = (error: string) => {
          cleanup();
          reject(new Error(error));
        };

        const cleanup = () => {
          prev.onComplete = prevOnComplete;
          prev.onError = prevOnError;
        };

        // 临时包装回调：保留原有处理，追加管道监听
        const prev = (channel as any)._callbacks || {};
        const prevOnComplete = prev.onComplete;
        const prevOnError = prev.onError;

        channel.setCallbacks({
          ...prev,
          onComplete: (data: any) => {
            prevOnComplete?.(data);
            // 等待一小段确保流式数据完整
            setTimeout(() => onComplete(data), 100);
          },
          onError: (err: string) => {
            prevOnError?.(err);
            onError(err);
          },
        });

        // 兜底超时
        setTimeout(() => {
          cleanup();
          reject(new Error('LLM 请求超时'));
        }, MAX_WAIT);
      });
    },
  };
}
