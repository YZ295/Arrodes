/**
 * 内置技能分级授权测试
 *
 * 验证 exec_command / write_file 走统一 actionGate（高危需确认，不直接执行），
 * read_file 保持低风险（自动执行）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { executeToolCall } from './registry.js';
import { actionGate, classifyAction } from '../services/actionGate.js';
// 模块加载时注册内置技能
import './builtin.js';

describe('内置技能分级授权', () => {
  beforeEach(() => {
    for (const item of actionGate.list()) actionGate.deny(item.id);
  });

  it('风险分类：exec_command/write_file 高危，read_file 低危', () => {
    expect(classifyAction('exec_command')).toBe('high');
    expect(classifyAction('write_file')).toBe('high');
    expect(classifyAction('read_file')).toBe('low');
  });

  it('exec_command 需确认，不会直接执行', async () => {
    const result = await executeToolCall('exec_command', { command: 'echo hello' });
    expect(result).toContain('需要你确认');
    const pending = actionGate.getLatest();
    expect(pending?.skill).toBe('exec_command');
    actionGate.deny(pending!.id);
  });

  it('write_file 需确认，不会直接落盘', async () => {
    const result = await executeToolCall('write_file', { path: 'C:/__arrodes_test__.txt', content: 'x' });
    expect(result).toContain('需要你确认');
    const pending = actionGate.getLatest();
    expect(pending?.skill).toBe('write_file');
    actionGate.deny(pending!.id);
  });
});
