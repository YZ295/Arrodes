/**
 * 管道执行器
 *
 * 按序执行 PipelineDefinition 中定义的阶段，提供：
 * - 超时保护（每个阶段独立超时）
 * - 错误传播策略（continueOnError 可配置跳过失败阶段）
 * - 性能追踪（每阶段耗时）
 * - 生命周期回调（onStart / onComplete / onError）
 *
 * 用法示例：
 * ```ts
 * const runner = new PipelineRunner({
 *   name: 'voice-chat',
 *   stages: [
 *     { name: 'stt', processor: sttProcessor },
 *     { name: 'llm', processor: llmProcessor, timeout: 25000 },
 *   ],
 *   onComplete: (ctx, results) => { ... },
 * });
 *
 * const result = await runner.run({ sessionId: 'xxx', startTime: Date.now() });
 * ```
 */
import type {
  PipelineDefinition,
  PipelineContext,
  PipelineResult,
  StageConfig,
  StageOutput,
} from '@shared/types/pipeline';
import type { MemoryNode } from '@shared/types';

/** 默认阶段超时 (ms) */
const DEFAULT_STAGE_TIMEOUT = 15000;

/** 管道执行器 */
export class PipelineRunner {
  private definition: PipelineDefinition;

  constructor(definition: PipelineDefinition) {
    this.definition = definition;
  }

  /**
   * 运行管道
   * @param context 管道上下文
   * @returns 管道结果
   */
  async run(context: PipelineContext): Promise<PipelineResult> {
    const stageDurations: Record<string, number> = {};
    let previousOutput: unknown = undefined;

    this.definition.onStart?.(context);

    try {
      for (const stage of this.definition.stages) {
        const stageStart = performance.now();

        try {
          const output = await this.executeStage(stage, {
            context,
            previousOutput,
          });

          const duration = Math.round(performance.now() - stageStart);
          stageDurations[stage.name] = duration;

          if (output.continue) {
            previousOutput = output.data;
          } else {
            // 阶段指示停止管道
            return {
              success: true,
              duration: Math.round(performance.now() - context.startTime),
              context,
              reply: '',
              newMemories: [],
              stageDurations,
            };
          }
        } catch (error) {
          const duration = Math.round(performance.now() - stageStart);
          stageDurations[stage.name] = duration;

          if (stage.continueOnError) {
            // 跳过失败的阶段，继续下一个
            console.warn(`[Pipeline] ${stage.name} 失败但跳过:`, error);
            continue;
          }

          // 阶段失败且不跳过 → 管道终止
          const err = error instanceof Error ? error : new Error(String(error));
          this.definition.onError?.(context, err, stage.name);

          return {
            success: false,
            duration: Math.round(performance.now() - context.startTime),
            context,
            reply: '',
            newMemories: [],
            stageDurations,
            failedStage: stage.name,
            error: err.message,
          };
        }
      }

      // 所有阶段完成
      const results = this.definition.stages.map((s) => context.state[s.name]);
      this.definition.onComplete?.(context, results);

      return {
        success: true,
        duration: Math.round(performance.now() - context.startTime),
        context,
        reply: (context.state.reply as string) || '',
        newMemories: (context.state.newMemories as MemoryNode[] | undefined) || [],
        stageDurations,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.definition.onError?.(context, err, '_pipeline_');
      return {
        success: false,
        duration: Math.round(performance.now() - context.startTime),
        context,
        reply: '',
        newMemories: [],
        stageDurations,
        error: err.message,
      };
    }
  }

  /** 更新阶段定义（热替换处理器） */
  updateStages(stages: StageConfig[]): void {
    this.definition = { ...this.definition, stages };
  }

  /** 执行单个阶段（含超时保护） */
  private async executeStage<TIn, TOut>(
    stage: StageConfig<TIn, TOut>,
    input: { context: PipelineContext; previousOutput: unknown },
  ): Promise<StageOutput<TOut>> {
    const timeout = stage.timeout ?? DEFAULT_STAGE_TIMEOUT;

    return new Promise<StageOutput<TOut>>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Stage "${stage.name}" 超时 (${timeout}ms)`));
      }, timeout);

      stage
        .processor({ context: input.context, previousOutput: input.previousOutput as TIn })
        .then((output) => {
          clearTimeout(timer);
          resolve(output);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

/**
 * 创建管道上下文的辅助函数
 */
export function createPipelineContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    sessionId: overrides?.sessionId || '',
    startTime: overrides?.startTime || Date.now(),
    state: overrides?.state || {},
    rawInput: overrides?.rawInput,
    audioBlob: overrides?.audioBlob,
  };
}
