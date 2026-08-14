/**
 * 工具执行管线测试（借鉴 DeepSeek Harness：策略与执行分离）
 *
 * 验证 pre-hook 可短路执行、post-hook 可观察结果、注册返回 disposer。
 */
import { describe, it, expect } from 'vitest';
import {
  registerSkill,
  registerToolPreHook,
  registerToolPostHook,
  executeToolCall,
} from './registry.js';

describe('工具执行管线', () => {
  it('pre-hook 短路时不执行技能，且 disposer 可撤销', async () => {
    let executed = false;
    registerSkill({
      name: '__pipeline_pre_short__',
      description: 'x',
      args: [],
      risk: 'low',
      execute: async () => {
        executed = true;
        return 'ran';
      },
    });

    const dispose = registerToolPreHook(async (skill) =>
      skill.name === '__pipeline_pre_short__' ? 'blocked' : null,
    );
    const result = await executeToolCall('__pipeline_pre_short__', {});
    expect(result).toBe('blocked');
    expect(executed).toBe(false);

    dispose();
    const after = await executeToolCall('__pipeline_pre_short__', {});
    expect(after).toBe('ran');
  });

  it('post-hook 能观察执行结果', async () => {
    let seen = '';
    registerSkill({
      name: '__pipeline_post_observe__',
      description: 'x',
      args: [],
      risk: 'low',
      execute: async () => 'ok',
    });

    const dispose = registerToolPostHook(async (skill, _args, result) => {
      if (skill.name === '__pipeline_post_observe__') seen = result;
    });
    await executeToolCall('__pipeline_post_observe__', {});
    expect(seen).toBe('ok');
    dispose();
  });
});
