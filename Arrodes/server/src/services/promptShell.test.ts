/**
 * Prompt Shell 测试（可精炼外壳：版本化 + 回滚）
 * 使用独立临时 shell 文件隔离（PROMPT_SHELL_FILE 注入）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  updatePromptShell, removePromptShellEntry, rollbackPromptShell,
  getPromptShellText, getPromptShellState,
} from './promptShell.js';

describe('Prompt Shell（可精炼外壳）', () => {
  let shellFile: string;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'prompt-shell-test-'));
    shellFile = join(dir, 'shell.json');
    process.env.PROMPT_SHELL_FILE = shellFile;
  });

  afterEach(() => {
    delete process.env.PROMPT_SHELL_FILE;
    try { rmSync(dirname(shellFile), { recursive: true, force: true }); } catch { /* 清理失败忽略 */ }
  });

  it('初始为空（独立文件隔离，不污染真实数据）', () => {
    expect(getPromptShellText()).toBe('');
  });

  it('追加提示 → 版本递增 + 文本包含', () => {
    const v1 = updatePromptShell('回答要用简体中文');
    expect(v1).toBeGreaterThan(0);
    expect(getPromptShellText()).toContain('简体中文');
    const v2 = updatePromptShell('用户偏好简洁回答');
    expect(v2).toBe(v1 + 1);
    expect(getPromptShellText()).toContain('简洁回答');
  });

  it('重复条目去重（同内容只保留一条）', () => {
    updatePromptShell('X指令');
    const v = updatePromptShell('X指令');
    expect(getPromptShellState().entries.filter((e) => e === 'X指令')).toHaveLength(1);
    expect(v).toBe(getPromptShellState().version);
  });

  it('删除条目', () => {
    updatePromptShell('A');
    updatePromptShell('B');
    removePromptShellEntry('A');
    const text = getPromptShellText();
    expect(text).not.toContain('A');
    expect(text).toContain('B');
  });

  it('回滚到上一版本（快照恢复）', () => {
    updatePromptShell('v1内容');
    updatePromptShell('v2内容');
    const v = rollbackPromptShell();
    // 回滚后应恢复为 v1 状态（只剩 v1内容）
    const text = getPromptShellText();
    expect(text).toContain('v1内容');
    expect(text).not.toContain('v2内容');
    expect(v).toBe(1);
  });
});
