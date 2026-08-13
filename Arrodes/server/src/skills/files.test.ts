/**
 * 文件操作技能族测试
 *
 * 验证：读/列低风险自动执行，写/建/删/移/复高风险需确认。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeToolCall } from './registry.js';
import { actionGate, classifyAction } from '../services/actionGate.js';
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

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
