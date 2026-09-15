/**
 * SQLite 数据库连接单例
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

let _db: Database.Database | null = null;
/** 测试注入：覆盖数据库路径（如 ':memory:'），仅测试环境调用 */
let _testDbPath: string | null = null;

export function setDbPathForTests(dbPath: string): void {
  _testDbPath = dbPath;
}

export function getDb(): Database.Database {
  if (_db) return _db;

  // 测试注入优先（内存库），否则走配置路径
  let dbFile: string;
  if (_testDbPath) {
    dbFile = _testDbPath;
  } else {
    const dbDir = path.resolve(config.dbPath);
    fs.mkdirSync(dbDir, { recursive: true });
    dbFile = path.join(dbDir, 'arrodes.db');
  }

  _db = new Database(dbFile);

  // 启用 WAL 模式提升并发读性能（内存库忽略）
  _db.pragma('journal_mode = WAL');
  // 外键约束
  _db.pragma('foreign_keys = ON');

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
