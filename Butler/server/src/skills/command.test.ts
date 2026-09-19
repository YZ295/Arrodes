/**
 * 命令技能分级授权测试
 *
 * 验证 exec_command 走统一 actionGate（高危需确认，不直接执行），
 * 以及命令黑名单的结构化拦截。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeToolCall } from './registry.js';
import { actionGate, classifyAction } from '../services/actionGate.js';
import * as commandModule from './command.js';
import { blockedCommandReason } from './command.js';
import { setCommandProvider, LocalCommandProvider, type CommandProvider } from '../services/commandProvider.js';
import { withActionScope } from '../services/actionContext.js';
import { WingetSoftwareProvider } from '../services/softwareProvider.js';

function executeInSession(command: string): Promise<string> {
  return withActionScope({
    owner: { localUserId: 'local-user', workspaceId: 'workspace-test', sessionId: 'session-test' },
    getAuthorizedRoots: () => [],
  }, () => executeToolCall('exec_command', { command }));
}

function executeSkillInSession(name: string, args: Record<string, unknown>): Promise<string> {
  return withActionScope({
    owner: { localUserId: 'local-user', workspaceId: 'workspace-test', sessionId: 'session-test' },
    getAuthorizedRoots: () => [],
  }, () => executeToolCall(name, args));
}

describe('命令技能分级授权', () => {
  beforeEach(() => {
    for (const item of actionGate.list()) actionGate.deny(item.id);
  });

  it('exec_command 为高风险', () => {
    expect(classifyAction('exec_command')).toBe('high');
  });

  it('exec_command 需确认，不会直接执行', async () => {
    const result = await executeInSession('echo hello');
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

  it('能力 seam：exec_command 消费可替换的 CommandProvider', async () => {
    let ran = '';
    const fake: CommandProvider = {
      run: (command) => {
        ran = command;
        return { stdout: 'ok', stderr: '', exitCode: 0 };
      },
    };

    setCommandProvider(fake);
    try {
      await executeInSession('echo hi');
      const pending = actionGate.getLatest()!;
      const result = await pending.executor!(pending.args);
      expect(result).toBe('ok');
      expect(ran).toBe('echo hi');
      actionGate.deny(pending.id);
    } finally {
      setCommandProvider(new LocalCommandProvider());
    }
  });
});

describe('卸载软件端到端结果核验', () => {
  const api = commandModule as typeof commandModule & {
    setSoftwareProvider?: (provider: {
      isInstalled: (packageId: string) => boolean;
      uninstall: (packageId: string) => { exitCode: number; output: string };
    }) => void;
  };

  beforeEach(() => {
    for (const item of actionGate.list()) actionGate.deny(item.id);
  });

  afterEach(() => {
    for (const item of actionGate.list()) actionGate.deny(item.id);
    api.setSoftwareProvider!(new WingetSoftwareProvider());
  });

  it('使用精确软件 ID，确认后卸载并以再次查询为成功标准', async () => {
    const installed = [true, false];
    const seen: string[] = [];
    api.setSoftwareProvider!({
      isInstalled: (id) => { seen.push(`query:${id}`); return installed.shift() ?? false; },
      uninstall: (id) => { seen.push(`uninstall:${id}`); return { exitCode: 0, output: 'ok' }; },
    });

    const queued = await executeSkillInSession('uninstall_software', { packageId: 'Vendor.Product' });
    expect(queued).toContain('需要你确认');
    const pending = actionGate.getLatest()!;
    expect(pending.description).toContain('Vendor.Product');
    const result = await pending.executor!(pending.args);

    expect(result).toContain('已卸载并核验');
    expect(seen).toEqual(['query:Vendor.Product', 'uninstall:Vendor.Product', 'query:Vendor.Product']);
  });

  it('命令退出码为零但软件仍存在时判定失败', async () => {
    api.setSoftwareProvider!({
      isInstalled: () => true,
      uninstall: () => ({ exitCode: 0, output: 'ok' }),
    });

    await executeSkillInSession('uninstall_software', { packageId: 'Vendor.Product' });
    const pending = actionGate.getLatest()!;
    await expect(pending.executor!(pending.args)).rejects.toThrow('卸载后仍检测到');
  });

  it('允许卸载器短暂异步收尾，再次复查后确认完成', async () => {
    const installed = [true, true, false];
    api.setSoftwareProvider!({
      isInstalled: () => installed.shift() ?? false,
      uninstall: () => ({ exitCode: 0, output: 'ok' }),
    });

    await executeSkillInSession('uninstall_software', { packageId: 'Vendor.Product' });
    const pending = actionGate.getLatest()!;
    await expect(pending.executor!(pending.args)).resolves.toContain('已卸载并核验');
  });

  it('拒绝非精确软件 ID，避免参数注入', async () => {
    api.setSoftwareProvider!({
      isInstalled: () => true,
      uninstall: () => ({ exitCode: 0, output: 'ok' }),
    });

    await executeSkillInSession('uninstall_software', { packageId: 'Vendor.Product & shutdown /s' });
    const pending = actionGate.getLatest()!;
    await expect(pending.executor!(pending.args)).rejects.toThrow('软件 ID 格式无效');
  });
});
