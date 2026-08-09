/**
 * 会话仓库测试：归档 / 恢复 / 过期回收 / 列表过滤
 * 使用内存库，测试间隔离
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getDb, closeDb, setDbPathForTests } from './connection.js';
import { initSchema } from './schema.js';
import { SessionRepository } from './session-repo.js';

describe('SessionRepository 归档与回收', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  const createSession = (repo: SessionRepository, title: string, lastActiveAt?: string) => {
    const node = repo.create({ title, topic: 'other' });
    if (lastActiveAt) {
      // 直接改 last_active_at 模拟过期
      getDb().prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(lastActiveAt, node.id);
    }
    return node;
  };

  it('archive 后 findAll 默认列表不包含该会话', () => {
    const repo = new SessionRepository();
    const s = createSession(repo, '要归档的会话');
    repo.archive(s.id);
    const list = repo.findAll();
    expect(list.some((x) => x.id === s.id)).toBe(false);
  });

  it('findAll({ archived: true }) 只返回归档会话', () => {
    const repo = new SessionRepository();
    const s = createSession(repo, '归档会话A');
    createSession(repo, '正常会话B');
    repo.archive(s.id);
    const archived = repo.findAll(undefined, { archived: true });
    const active = repo.findAll(undefined, { archived: false });
    expect(archived.map((x) => x.id)).toContain(s.id);
    expect(active.map((x) => x.id)).not.toContain(s.id);
  });

  it('unarchive 后恢复可见', () => {
    const repo = new SessionRepository();
    const s = createSession(repo, '恢复的会话');
    repo.archive(s.id);
    repo.unarchive(s.id);
    const list = repo.findAll();
    expect(list.some((x) => x.id === s.id)).toBe(true);
  });

  it('autoArchiveStale 只回收超过 N 天未活跃的会话', () => {
    const repo = new SessionRepository();
    // 60 天前未活跃 → 应被回收
    createSession(repo, '旧会话', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString());
    // 10 天前未活跃 → 不应被回收（默认 30 天）
    createSession(repo, '新会话', new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString());
    const recycled = repo.autoArchiveStale(30);
    expect(recycled).toBe(1);
  });

  it('归档会话数据保留（delete 才是真删）', () => {
    const repo = new SessionRepository();
    const s = createSession(repo, '归档保留数据');
    repo.archive(s.id);
    // 归档后仍可通过 findById 查到（数据未删）
    const detail = repo.findById(s.id);
    expect(detail).not.toBeNull();
  });
});
