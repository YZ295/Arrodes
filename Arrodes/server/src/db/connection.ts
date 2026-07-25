/**
 * SQLite 数据库连接单例
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { config } from '../config.js';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbDir = path.resolve(config.dbPath);
  fs.mkdirSync(dbDir, { recursive: true });

  const dbFile = path.join(dbDir, 'arrodes.db');
  _db = new Database(dbFile);

  // 启用 WAL 模式提升并发读性能
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
