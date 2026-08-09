/**
 * LLM 推理阶段
 *
 * 通过 MessageChannel 发送消息到服务端：
 * - 流式 chunks → 通过订阅回调推送（按 requestId 认领，并发不串线）
 * - 等待 complete → resolve 管道阶段
 *
 * 方案 A（消息 ID 关联）：发送消息时生成 requestId，订阅该 id 的事件流；
 * abort 时发 cancel（带同 id）+ reject，管道立即终止。
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

      // 生成请求标识并发送（服务端所有事件回带同 id）
      const requestId = channel.nextRequestId();
      channel.send({
        type: 'message',
        sessionId,
        content,
        isVoice: !!input.context.audioBlob,
        requestId,
        ...(intentData ? { intent: intentData } : {}),
      });

      // 等待 complete / error / abort
      return new Promise((resolve, reject) => {
        const startWait = Date.now();
        const MAX_WAIT = 50000; // 50s 兜底

        let settled = false;
        let unsubscribe: (() => void) | null = null;
        // C8 修复：兜底超时 timer 存变量，cleanup 时 clearTimeout（防长会话累积空转 timer）
        let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }
          input.context.signal?.removeEventListener('abort', onAbort);
        };

        const onComplete = (data: { content: string }) => {
          if (settled) return;
          settled = true;
          cleanup();
          input.context.state.reply = data.content;
          resolve({
            data: { content: data.content, newMemories: [] },
            continue: true,
            duration: Date.now() - startWait,
          });
        };

        const onError = (error: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(error));
        };

        // 用户停止 → 发送 cancel（带同 id 中断服务端推理）+ 本地立即结束等待
        const onAbort = () => {
          if (settled) return;
          settled = true;
          cleanup();
          channel.send({ type: 'cancel', sessionId, content: '', isVoice: false, requestId });
          reject(new Error('cancelled'));
        };

        // 挂载取消监听 + 订阅该请求的事件流
        input.context.signal?.addEventListener('abort', onAbort, { once: true });
        if (input.context.signal?.aborted) {
          onAbort();
          return;
        }

        unsubscribe = channel.subscribe(requestId, {
          onChunk: () => {
            // chunks 由全局回调/订阅推送到 UI，此处无需处理（等待 complete）
          },
          onComplete: (data) => onComplete({ content: (data as { content?: string }).content || '' }),
          onStopped: () => {
            // 服务端已确认停止 → 视同取消
            if (!settled) {
              settled = true;
              cleanup();
              reject(new Error('cancelled'));
            }
          },
          onError: (err) => onError(err),
        });

        // 兜底超时（cleanup 会 clearTimeout，正常完成不残留）
        timeoutTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error('LLM 请求超时'));
        }, MAX_WAIT);
      });
    },
  };
}
