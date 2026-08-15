import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { recordAgentMemory } from './agentMemories.js';

describe('recordAgentMemory（T-04 外部智能体写记忆，经 Arrodes 中转）', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  it('写入统一格式记忆：来源为该智能体、归属该工作区', () => {
    const memory = recordAgentMemory({
      workspaceId: 'ws1',
      agentId: 'codex',
      content: '用户偏好深色主题',
    });
    expect(memory.sourceAgent).toBe('codex');
    expect(memory.workspaceId).toBe('ws1');
    expect(memory.type).toBe('note');
    expect(memory.content).toBe('用户偏好深色主题');
  });

  it('空内容拒绝写入', () => {
    expect(() =>
      recordAgentMemory({ workspaceId: 'ws1', agentId: 'codex', content: '   ' }),
    ).toThrow();
  });
});
