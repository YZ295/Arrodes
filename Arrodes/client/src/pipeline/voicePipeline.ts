/**
 * 语音对话管道
 *
 * 将 PipelineRunner + 各个阶段处理器组装成可执行的完整对话链路。
 * 集成 PluginManager 的 beforePipeline / afterPipeline 钩子。
 *
 * 流程：
 *   用户输入 → [Intent检测] → [LLM推理(流式)] → [TTS播放]
 *               ↓ 本地意图?                ↑
 *               直接回复 ←─────────────────┘
 *
 * 使用方式：
 * ```ts
 * const pipeline = createVoicePipeline({ ttsSpeak });
 * const result = await pipeline.run(text, sessionId);
 * console.log(result.stageDurations); // { intent: 2, llm: 3120, tts: 890 }
 * ```
 */
import { PipelineRunner, createPipelineContext } from '../core/Pipeline';
import { getPluginManager } from '../core/PluginManager';
import type {
  PipelineResult,
  PipelineContext,
  StageConfig,
} from '@shared/types/pipeline';

import { createIntentStage } from './stages/intentStage';
import { createLlmStage } from './stages/llmStage';
import { createTtsStage, type TtsStageDeps } from './stages/ttsStage';
import { createMemoryStage } from './stages/memoryStage';

// ============================================================
// 管道创建
// ============================================================

export interface VoicePipelineDeps {
  ttsSpeak: (text: string) => Promise<void>;
}

/**
 * 创建语音对话管道实例
 */
export function createVoicePipeline(deps: VoicePipelineDeps): VoicePipelineRunner {
  const stages: StageConfig[] = [
    createIntentStage(),
    createLlmStage(),
    createMemoryStage(),
    createTtsStage({ speak: deps.ttsSpeak }),
  ];

  const runner = new PipelineRunner({
    name: 'voice-chat',
    stages,
    onStart: (ctx) => {
      console.log(
        `%c[Pipeline:voice-chat] %c开始 %c${ctx.rawInput?.slice(0, 40)}`,
        'color:#f59e0b', 'color:inherit', 'color:#888',
      );
    },
    onComplete: (ctx, _results) => {
      const total = Date.now() - ctx.startTime;
      const reply = (ctx.state.reply as string || '').slice(0, 50);
      console.log(
        `%c[Pipeline:voice-chat] %c完成 %c${total}ms %c${reply}...`,
        'color:#10b981', 'color:inherit', 'color:#888', 'color:#aaa',
      );
    },
    onError: (ctx, err, stage) => {
      console.error(
        `%c[Pipeline:voice-chat] %c失败 %c${stage}`,
        'color:#ef4444', 'color:inherit', 'color:#f59e0b',
        err.message,
      );
    },
  });

  return new VoicePipelineRunner(runner);
}

// ============================================================
// VoicePipelineRunner 封装
// ============================================================

export class VoicePipelineRunner {
  private runner: PipelineRunner;

  constructor(runner: PipelineRunner) {
    this.runner = runner;
  }

  /**
   * 运行语音对话管道
   *
   * @param text 用户输入文本
   * @param sessionId 当前会话 ID
   * @param isVoice 是否为语音输入
   * @returns 管道结果（含各阶段耗时）
   */
  async run(text: string, sessionId: string, isVoice = false): Promise<PipelineResult> {
    const ctx = createPipelineContext({
      sessionId,
      rawInput: text,
      state: { isVoice },
    });

    // === PluginManager: beforePipeline 钩子 ===
    const pm = getPluginManager();
    try {
      await pm.runBeforePipelineHooks(ctx);
    } catch (err) {
      console.warn('[Pipeline] beforePipeline 钩子异常，继续执行:', err);
    }

    // === 执行管道 ===
    const result = await this.runner.run(ctx);

    // === PluginManager: afterPipeline 钩子 ===
    try {
      await pm.runAfterPipelineHooks(result);
    } catch (err) {
      console.warn('[Pipeline] afterPipeline 钩子异常:', err);
    }

    return result;
  }

  /** 获取内部的 PipelineRunner（用于高级操作） */
  getRunner(): PipelineRunner {
    return this.runner;
  }
}

// ============================================================
// 便捷函数：获取管道日志摘要
// ============================================================

export function formatPipelineLog(result: PipelineResult): string {
  const lines = [
    `[Pipeline] ${result.success ? '✅' : '❌'} 总耗时: ${result.duration}ms`,
  ];
  for (const [stage, duration] of Object.entries(result.stageDurations)) {
    lines.push(`  ├─ ${stage}: ${duration}ms`);
  }
  if (result.error) {
    lines.push(`  └─ 错误: ${result.error}`);
  }
  return lines.join('\n');
}
