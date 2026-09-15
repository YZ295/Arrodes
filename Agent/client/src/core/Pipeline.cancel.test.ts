import { describe, expect, it, vi } from 'vitest';
import { PipelineRunner, createPipelineContext } from './Pipeline';

describe('PipelineRunner 取消优先级', () => {
  it('取消不会被 continueOnError 吞掉，也不触发完成钩子和后续阶段', async () => {
    const controller = new AbortController();
    const nextStage = vi.fn(async () => ({ data: undefined, continue: true, duration: 0 }));
    const onComplete = vi.fn();
    const runner = new PipelineRunner({
      name: 'cancel-test',
      stages: [
        {
          name: 'tts',
          continueOnError: true,
          processor: async () => {
            controller.abort();
            const error = new Error('playback aborted');
            error.name = 'AbortError';
            throw error;
          },
        },
        { name: 'after-tts', processor: nextStage },
      ],
      onComplete,
    });

    const result = await runner.run(createPipelineContext({ signal: controller.signal }));

    expect(result).toMatchObject({ success: false, failedStage: 'tts', error: 'cancelled' });
    expect(nextStage).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
