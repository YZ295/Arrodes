import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, closeDb, setDbPathForTests } from './connection.js';
import { initSchema } from './schema.js';
import { WorkspaceRepository } from './workspace-repo.js';

const repo = new WorkspaceRepository();

describe('WorkspaceRepository 成员管理（T-01 接入与连线）', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  it('addMember 把 agent 接入工作区', () => {
    const ws = repo.create({ name: '大创项目' });
    const member = repo.addMember(ws.id, 'agent', 'codex');
    expect(member.workspaceId).toBe(ws.id);
    expect(member.memberId).toBe('codex');
    expect(member.memberType).toBe('agent');
    expect(repo.listMembers(ws.id).some((m) => m.memberId === 'codex')).toBe(true);
  });

  it('addMember 幂等：重复接入同一 agent 不产生重复成员', () => {
    const ws = repo.create({ name: '大创项目' });
    repo.addMember(ws.id, 'agent', 'hermes');
    repo.addMember(ws.id, 'agent', 'hermes');
    const members = repo.listMembers(ws.id).filter((m) => m.memberId === 'hermes');
    expect(members.length).toBe(1);
  });

  it('removeMember 断开 agent；不存在时返回 false', () => {
    const ws = repo.create({ name: '大创项目' });
    repo.addMember(ws.id, 'agent', 'codex');
    expect(repo.removeMember(ws.id, 'agent', 'codex')).toBe(true);
    expect(repo.listMembers(ws.id).some((m) => m.memberId === 'codex')).toBe(false);
    expect(repo.removeMember(ws.id, 'agent', 'codex')).toBe(false);
  });

  it('listMembers 按工作区隔离；同一 agent 可接入多个工作区', () => {
    const a = repo.create({ name: 'A' });
    const b = repo.create({ name: 'B' });
    repo.addMember(a.id, 'agent', 'codex');
    repo.addMember(b.id, 'agent', 'hermes');
    expect(repo.listMembers(a.id).map((m) => m.memberId)).toContain('codex');
    expect(repo.listMembers(a.id).map((m) => m.memberId)).not.toContain('hermes');
    repo.addMember(b.id, 'agent', 'codex');
    expect(repo.listMembers(b.id).map((m) => m.memberId)).toContain('codex');
    // b = owner(local-user) + hermes + codex
    const count = (getDb().prepare('SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ?').get(b.id) as { c: number }).c;
    expect(count).toBe(3);
  });
});
