import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, getDb, setDbPathForTests } from './connection.js';
import { initSchema } from './schema.js';
import { SeminarRepository } from './seminar-repo.js';
import { workspaceRepo } from './workspace-repo.js';

const repo = new SeminarRepository();

describe('SeminarRepository（T-08 多方研讨会）', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  it('创建研讨会保存 participants 列表（2-5 个）', () => {
    const ws = workspaceRepo.create({ name: 'ws' });
    const s = repo.create({
      workspaceId: ws.id,
      topic: '多方协作',
      participants: ['codex', 'hermes', 'deepseekHarness'],
      rounds: 1,
    });
    expect(s.participants).toEqual(['codex', 'hermes', 'deepseekHarness']);
    expect(repo.get(s.id)?.participants).toEqual(['codex', 'hermes', 'deepseekHarness']);
    expect(repo.get(s.id)?.agentA).toBe('codex');
    expect(repo.get(s.id)?.agentB).toBe('hermes');
  });

  it('旧记录（无 participants）回退为 [agentA, agentB]', () => {
    const ws = workspaceRepo.create({ name: 'ws' });
    const s = repo.create({
      workspaceId: ws.id,
      topic: '旧记录',
      participants: ['codex', 'hermes'],
      rounds: 1,
    });
    // 模拟老库：直接清空 participants
    getDb().prepare('UPDATE workspace_seminars SET participants = ? WHERE id = ?').run('[]', s.id);
    const loaded = repo.get(s.id);
    expect(loaded?.participants).toEqual(['codex', 'hermes']);
  });
});
