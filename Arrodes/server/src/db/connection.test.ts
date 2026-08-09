/**
 * 数据库连接测试
 * 验证：测试环境可用内存库（:memory:），且会话间隔离（closeDb 后可重建）
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getDb, closeDb, setDbPathForTests } from './connection.js';
import { initSchema } from './schema.js';

describe('db connection', () => {
  afterEach(() => {
    closeDb();
  });

  it('测试模式可用内存库（:memory:），不写磁盘', () => {
    setDbPathForTests(':memory:');
    const db = getDb();
    expect(db).toBeTruthy();
    // 内存库可正常建表
    initSchema();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(tables.some((t) => t.name === 'sessions')).toBe(true);
  });

  it('closeDb 后重新 getDb 返回新实例（测试隔离）', () => {
    setDbPathForTests(':memory:');
    const first = getDb();
    closeDb();
    const second = getDb();
    expect(second).not.toBe(first);
  });
});
