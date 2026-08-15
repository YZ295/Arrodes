import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { AgentChatRepository } from '../db/agent-chat-repo.js';
import { dispatchAgentTask } from './agentTasks.js';
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
});
