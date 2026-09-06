import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  runWinOp,
  setWinopsRunnerForTest,
  resetWinopsRunnerForTest,
  isDesktopToolsEnabled,
  resolveWinopsScriptPath,
  type SpawnOutcome,
} from './winops.js';
import { executeToolCall } from '../skills/registry.js';
import { actionGate } from './actionGate.js';
import { setWinopsRunnerForTest as setRunner } from './winops.js';
await import('../skills/desktop.js');

const calls: Array<{ cmd: string; args: string[] }> = [];
const fakeRunner = async (cmd: string, args: string[]): Promise<SpawnOutcome> => {
  calls.push({ cmd, args });
  return { stdout: '{"ok":true,"data":{"title":"记事本"}}\n', stderr: '', exitCode: 0, timedOut: false };
};

describe('runWinOp', () => {
  beforeEach(() => {
    calls.length = 0;
    setWinopsRunnerForTest(fakeRunner);
  });
  afterEach(() => {
    resetWinopsRunnerForTest();
    delete process.env.DESKTOP_TOOLS;
  });

  it('默认开启桌面操控', () => {
    expect(isDesktopToolsEnabled()).toBe(true);
  });

  it('DESKTOP_TOOLS=off 时拒绝执行且不调用 runner', async () => {
    process.env.DESKTOP_TOOLS = 'off';
    await expect(runWinOp('open-app', { name: 'notepad' })).rejects.toThrow(/关闭/);
    expect(calls.length).toBe(0);
  });

  it('构造 powershell -File 参数与 JSON payload', async () => {
    const result = await runWinOp('open-app', { name: 'notepad' });
    expect(calls.length).toBe(1);
    const { cmd, args } = calls[0];
    expect(cmd).toBe('powershell');
    expect(args).toContain('-File');
    const scriptIdx = args.indexOf('-File');
    expect(args[scriptIdx + 1].endsWith('winops.ps1')).toBe(true);
    expect(resolveWinopsScriptPath().endsWith('winops.ps1')).toBe(true);
    const payloadIdx = args.indexOf('-Payload');
    const payload = JSON.parse(args[payloadIdx + 1]);
    expect(payload).toEqual({ name: 'notepad' });
    expect(result).toEqual({ ok: true, data: { title: '记事本' } });
  });

  it('超时返回错误', async () => {
    setWinopsRunnerForTest(async () => ({ stdout: '', stderr: '', exitCode: null, timedOut: true }));
    const result = await runWinOp('screenshot');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('超时');
  });

  it('无 JSON 输出时用 stderr 报错', async () => {
    setWinopsRunnerForTest(async () => ({ stdout: 'Add-Type : 失败\n', stderr: 'boom', exitCode: 1, timedOut: false }));
    const result = await runWinOp('volume', { action: 'up' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('桌面技能确认后经 executor 直通执行（不二次排队）', async () => {
    const calls: string[] = [];
    setWinopsRunnerForTest(async (cmd, args) => {
      calls.push(args[args.indexOf('-Op') + 1]);
      return { stdout: '{"ok":true,"data":{"detail":"typed 2 chars"}}\n', stderr: '', exitCode: 0, timedOut: false };
    });
    const first = await executeToolCall('type_text', { text: 'hi' });
    expect(first).toContain('需要你确认');
    expect(actionGate.list().length).toBe(1);
    const latest = actionGate.getLatest()!;
    const result = await latest.executor!(latest.args);
    expect(result).toContain('typed 2 chars');
    expect(calls).toEqual(['type-text']);
    actionGate.deny(latest.id);
  });
});
