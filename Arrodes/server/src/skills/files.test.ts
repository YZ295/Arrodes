/**
 * 文件操作技能族测试
 *
 * 验证：读/列低风险自动执行，写/建/删/移/复高风险需确认。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeToolCall, getSkill } from './registry.js';
import { actionGate, classifyAction } from '../services/actionGate.js';
import { setFsProvider, LocalFsProvider, type FsProvider } from '../services/fsProvider.js';
import './files.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-files-test-'));

describe('文件操作技能分级授权', () => {
  beforeEach(() => {
    for (const item of actionGate.list()) actionGate.deny(item.id);
  });

  it('风险分类正确', () => {
    expect(classifyAction('list_directory')).toBe('low');
    expect(classifyAction('read_file')).toBe('low');
    expect(classifyAction('get_file_info')).toBe('low');
    expect(classifyAction('write_file')).toBe('high');
    expect(classifyAction('create_file')).toBe('high');
    expect(classifyAction('delete_file')).toBe('high');
    expect(classifyAction('move_file')).toBe('high');
    expect(classifyAction('copy_file')).toBe('high');
  });

  it('只读元数据正确标记', () => {
    expect(getSkill('list_directory')?.readOnly).toBe(true);
    expect(getSkill('read_file')?.readOnly).toBe(true);
    expect(getSkill('get_file_info')?.readOnly).toBe(true);
    expect(getSkill('create_file')?.readOnly).toBe(false);
    expect(getSkill('write_file')?.readOnly).toBe(false);
  });

  it('list_directory 低风险自动执行', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello');
    const result = await executeToolCall('list_directory', { path: tmpDir });
    expect(result).toContain('a.txt');
    expect(actionGate.list().length).toBe(0);
  });

  it('create_file 高风险需确认，不直接落盘', async () => {
    const target = path.join(tmpDir, 'created.txt');
    const result = await executeToolCall('create_file', { path: target });
    expect(result).toContain('需要你确认');
    expect(fs.existsSync(target)).toBe(false);
    expect(actionGate.getLatest()?.skill).toBe('create_file');
    actionGate.deny(actionGate.getLatest()!.id);
  });

  it('create_file 确认执行后回读核验', async () => {
    const target = path.join(tmpDir, 'verified.txt');
    await executeToolCall('create_file', { path: target, content: 'ok' });
    const pending = actionGate.getLatest()!;
    const result = await pending.executor!(pending.args);
    expect(result).toContain('核验');
    expect(fs.readFileSync(target, 'utf-8')).toBe('ok');
    actionGate.deny(pending.id);
  });

  it('能力 seam：文件技能消费可替换的 FsProvider', async () => {
    const reads: string[] = [];
    const fake: FsProvider = {
      exists: () => true,
      readdir: () => [{ name: 'fake.txt', isDirectory: false, size: 3 }],
      stat: () => ({ isFile: true, isDirectory: false, size: 3, mtimeMs: Date.now() }),
      readFile: (p) => {
        reads.push(p);
        return 'hi';
      },
      mkdirp: () => {},
      appendFile: () => {},
      writeFile: () => {},
      rmdir: () => {},
      unlink: () => {},
      rename: () => {},
      copyFile: () => {},
    };

    setFsProvider(fake);
    try {
      const result = await executeToolCall('read_file', { path: 'E:/fake/note.txt' });
      expect(result).toContain('note.txt');
      expect(reads.length).toBeGreaterThan(0);
    } finally {
      setFsProvider(new LocalFsProvider());
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
