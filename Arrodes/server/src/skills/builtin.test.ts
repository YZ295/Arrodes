/**
 * 内置命令技能分级授权测试
 *
 * 验证 exec_command 走统一 actionGate（高危需确认，不直接执行）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { executeToolCall } from './registry.js';
import { actionGate, classifyAction } from '../services/actionGate.js';
// 模块加载时注册内置技能
import { blockedCommandReason } from './builtin.js';

describe('内置命令技能分级授权', () => {
  beforeEach(() => {
    for (const item of actionGate.list()) actionGate.deny(item.id);
  });

  it('exec_command 为高风险', () => {
    expect(classifyAction('exec_command')).toBe('high');
  });

  it('exec_command 需确认，不会直接执行', async () => {
    const result = await executeToolCall('exec_command', { command: 'echo hello' });
    expect(result).toContain('需要你确认');
    const pending = actionGate.getLatest();
    expect(pending?.skill).toBe('exec_command');
    actionGate.deny(pending!.id);
  });

  it('结构化拦截：危险命令动词（含扩展名）被拦', () => {
    expect(blockedCommandReason('format c:')).toContain('安全拦截');
    expect(blockedCommandReason('format.com c:')).toContain('安全拦截');
    expect(blockedCommandReason('shutdown /s')).toContain('安全拦截');
    expect(blockedCommandReason('rd /s /q C:\\tmp')).toContain('安全拦截');
  });

  it('结构化拦截：无害命令不被误伤', () => {
    expect(blockedCommandReason('echo shutdown')).toBeNull();
    expect(blockedCommandReason('git status')).toBeNull();
    expect(blockedCommandReason('dir')).toBeNull();
  });
});
