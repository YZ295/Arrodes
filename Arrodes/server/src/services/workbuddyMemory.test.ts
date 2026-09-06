import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { workspaceMemoryHub } from '../workspace/memory-hub.js';
import { importWorkbuddyNotes } from './workbuddyMemory.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-wb-'));
const memDir = path.join(tmp, '.workbuddy', 'memory');
fs.mkdirSync(memDir, { recursive: true });
fs.writeFileSync(path.join(memDir, '2026-08-01.md'), '### 完成语音补全 [09:00]\n- TTS 回退完成', 'utf-8');
fs.writeFileSync(path.join(memDir, '2026-08-02.md'), '### 完成记忆导入 [10:00]\n- 共享记忆接通', 'utf-8');

describe('importWorkbuddyNotes（WorkBuddy 记忆导入）', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
  });

  it('把 .workbuddy/memory 的日期笔记导入为统一共享记忆（来源 workbuddy）', () => {
    const result = importWorkbuddyNotes(tmp, 'ws1', workspaceMemoryHub);
    expect(result.imported).toBe(2);
    const all = workspaceMemoryHub.listAll('ws1');
    expect(all.filter((m) => m.sourceAgent === 'workbuddy').length).toBe(2);
    expect(all[0].workspaceId).toBe('ws1');
  });

  it('幂等：重复导入不产生重复条目', () => {
    importWorkbuddyNotes(tmp, 'ws1', workspaceMemoryHub);
    const second = importWorkbuddyNotes(tmp, 'ws1', workspaceMemoryHub);
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(2);
    expect(workspaceMemoryHub.listAll('ws1').filter((m) => m.sourceAgent === 'workbuddy').length).toBe(2);
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
