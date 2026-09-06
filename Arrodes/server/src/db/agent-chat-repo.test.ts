import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, setDbPathForTests } from './connection.js';
import { initSchema } from './schema.js';
import { AgentChatRepository } from './agent-chat-repo.js';

const repo = new AgentChatRepository();

describe('AgentChatRepository 对话记录（T-02）', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  it('append 保存用户与智能体消息', () => {
    const m = repo.append('ws1', 'codex', 'user', '你好');
    expect(m.role).toBe('user');
    expect(m.content).toBe('你好');
    expect(m.agentId).toBe('codex');
  });

  it('list 按工作区与智能体返回历史（升序）', () => {
    repo.append('ws1', 'codex', 'user', '1');
    repo.append('ws1', 'codex', 'assistant', '2');
    repo.append('ws1', 'hermes', 'user', '其他');
    expect(repo.list('ws1', 'codex').map((m) => m.content)).toEqual(['1', '2']);
  });

  it('list 支持 limit 截断（保留最近 N 条）', () => {
    repo.append('ws1', 'codex', 'user', '1');
    repo.append('ws1', 'codex', 'assistant', '2');
    repo.append('ws1', 'codex', 'user', '3');
    expect(repo.list('ws1', 'codex', 2).map((m) => m.content)).toEqual(['2', '3']);
  });
});
