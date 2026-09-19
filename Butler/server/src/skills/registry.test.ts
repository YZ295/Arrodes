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
  setSkillEnabled,
  buildSkillsPrompt,
  executeToolCall,
  executeLocalSkillRequest,
} from './registry.js';
import type { ExecutionRequest } from '../services/executionProtocol.js';

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

  it('高风险技能没有会话授权上下文时拒绝创建待确认项', async () => {
    let executed = false;
    registerSkill({
      name: '__missing_scope_high_risk__',
      description: 'x',
      args: [],
      risk: 'high',
      execute: async () => {
        executed = true;
        return 'ran';
      },
    });

    await expect(executeToolCall('__missing_scope_high_risk__', {}))
      .resolves.toContain('缺少工作区授权上下文');
    expect(executed).toBe(false);
  });

  it('禁用技能后 executeToolCall 拒绝、buildSkillsPrompt 不包含（profile 组合）', async () => {
    registerSkill({
      name: '__profile_disable__',
      description: 'x',
      args: [],
      risk: 'low',
      execute: async () => 'ran',
    });
    setSkillEnabled('__profile_disable__', false);

    expect(await executeToolCall('__profile_disable__', {})).toContain('禁用');
    expect(buildSkillsPrompt()).not.toContain('__profile_disable__');

    setSkillEnabled('__profile_disable__', true);
  });
});

describe('统一执行器协议：本地技能适配器', () => {
  const request = (operation: string): ExecutionRequest => ({
    id: `request-${operation}`,
    backend: 'local-skill',
    intent: `action.${operation}`,
    operation,
    input: { value: 'hello' },
    context: { localUserId: 'local-user', workspaceId: 'workspace-1', sessionId: 'session-1' },
    requestedAt: '2026-09-19T09:00:00.000Z',
  });

  it('把本地技能成功结果投影为统一 ExecutionResult', async () => {
    registerSkill({
      name: '__execution_protocol_success__',
      description: 'x',
      args: [],
      risk: 'low',
      execute: async (args) => `ok:${String(args.value)}`,
    });

    const result = await executeLocalSkillRequest(request('__execution_protocol_success__'));

    expect(result).toMatchObject({
      requestId: 'request-__execution_protocol_success__',
      backend: 'local-skill',
      status: 'completed',
      output: 'ok:hello',
    });
    expect(result.startedAt).toEqual(expect.any(String));
    expect(result.finishedAt).toEqual(expect.any(String));
  });

  it('把未知技能投影为可诊断失败，而不是伪造成功文本', async () => {
    const result = await executeLocalSkillRequest(request('__execution_protocol_missing__'));

    expect(result).toMatchObject({
      requestId: 'request-__execution_protocol_missing__',
      status: 'failed',
      error: { code: 'SKILL_NOT_FOUND', retryable: false },
    });
  });

  it('拒绝把其他后端请求误交给本地技能适配器', async () => {
    const result = await executeLocalSkillRequest({ ...request('__execution_protocol_success__'), backend: 'codex' });

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'BACKEND_MISMATCH', retryable: false },
    });
  });

  it('拒绝请求用低风险意图冒充另一个本地操作', async () => {
    const result = await executeLocalSkillRequest({
      ...request('__execution_protocol_success__'),
      intent: 'filesystem.read',
    });

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'INTENT_MISMATCH', retryable: false },
    });
  });

  it('捕获技能异常并保留结构化失败原因', async () => {
    registerSkill({
      name: '__execution_protocol_failure__',
      description: 'x',
      args: [],
      risk: 'low',
      execute: async () => { throw new Error('boom'); },
    });

    const result = await executeLocalSkillRequest(request('__execution_protocol_failure__'));

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'EXECUTION_FAILED', message: 'boom', retryable: true },
    });
  });
});
