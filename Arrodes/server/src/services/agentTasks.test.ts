import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { AgentChatRepository } from '../db/agent-chat-repo.js';
import { buildAgentChatTask, dispatchAgentTask } from './agentTasks.js';
import type { AgentChatAdapter } from './agentAdapters.js';

const chatRepo = new AgentChatRepository();

describe('dispatchAgentTask（T-03 派发任务）', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  it('执行任务并把用户任务与结果写入对话历史', async () => {
    let seen = '';
    const adapter: AgentChatAdapter = {
      run: async (task) => {
        seen = task;
        return '完成';
      },
    };

    const reply = await dispatchAgentTask({
      workspaceId: 'ws1',
      agentId: 'codex',
      task: '改 README',
      adapter,
      cwd: 'E:/x',
      chatRepo,
    });

    expect(reply).toBe('完成');
    expect(seen).toBe('改 README');
    expect(chatRepo.list('ws1', 'codex').map((m) => m.content)).toEqual(['【任务】改 README', '【任务结果】完成']);
  });

  it('适配器失败时写入失败结果，历史不悬空', async () => {
    const adapter: AgentChatAdapter = {
      run: async () => {
        throw new Error('boom');
      },
    };

    await expect(
      dispatchAgentTask({
        workspaceId: 'ws1',
        agentId: 'codex',
        task: 'x',
        adapter,
        cwd: 'E:/x',
        chatRepo,
      }),
    ).rejects.toThrow('boom');

    expect(chatRepo.list('ws1', 'codex').map((m) => m.content)).toEqual(['【任务】x', '【任务结果】失败: boom']);
  });

  it('派发任务透传 sessionKey 与 permission', async () => {
    let seen: { sessionKey?: string; permission?: string } = {};
    const adapter: AgentChatAdapter = {
      run: async (_task, opts) => {
        seen = opts;
        return '完成';
      },
    };

    await dispatchAgentTask({
      workspaceId: 'ws1',
      agentId: 'codex',
      task: '改 README',
      adapter,
      cwd: 'E:/x',
      sessionKey: 'ws1:codex',
      permission: 'full',
      chatRepo,
    });

    expect(seen.sessionKey).toBe('ws1:codex');
    expect(seen.permission).toBe('full');
  });
});

describe('buildAgentChatTask（REQ-005 有状态对话任务构造）', () => {
  const history = [
    { role: 'user' as const, content: '第一句' },
    { role: 'assistant' as const, content: '回复一' },
    { role: 'user' as const, content: '第二句' },
  ];

  it('stateful adapter：只带学习注入 + 最新消息，不拼接历史', () => {
    const task = buildAgentChatTask({
      stateful: true,
      content: '今天天气',
      history,
      agentId: 'codex',
      learnings: '结论：先验证再实现',
    });
    expect(task).toContain('今天天气');
    expect(task).toContain('先验证再实现');
    expect(task).not.toContain('第一句');
    expect(task).not.toContain('以下是你们之前的对话');
  });

  it('非 stateful adapter 且历史多于一条：学习注入 + 完整历史 + 最新消息（行为不变）', () => {
    const task = buildAgentChatTask({
      stateful: false,
      content: '第二句',
      history,
      agentId: 'hermes',
      learnings: '结论：先验证再实现',
    });
    expect(task).toContain('第一句');
    expect(task).toContain('以下是你们之前的对话');
    expect(task).toContain('第二句');
    expect(task).toContain('先验证再实现');
  });

  it('首条消息（历史不足两条）：非 stateful 只回原消息（现状保持）', () => {
    const task = buildAgentChatTask({
      stateful: false,
      content: '你好',
      history: [{ role: 'user' as const, content: '你好' }],
      agentId: 'hermes',
      learnings: '结论：xxx',
    });
    expect(task).toBe('你好');
  });
});
