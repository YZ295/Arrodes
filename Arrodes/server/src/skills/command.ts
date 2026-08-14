/**
 * 命令执行技能（结构化拦截 + actionGate 分级授权）
 */
import { registerSkill } from './registry.js';

const BLOCKED_SUBSTRINGS = [
  'rm -rf', 'del /s', 'del /f', 'reg delete', 'sc delete',
  'taskkill /f /im', 'net stop', ':(){', '/dev/null >', 'mkfs',
  'dd if=', '> nul', '2>nul',
];

const BLOCKED_VERBS = new Set([
  'format', 'shutdown', 'restart', 'reg', 'sc', 'taskkill',
  'net', 'del', 'rd', 'rmdir', 'erase', 'diskpart',
]);

/** 结构化命令拦截：先匹配危险子串，再按命令动词（含 .exe/.com 等扩展名）精确拦截 */
export function blockedCommandReason(cmd: string): string | null {
  const lower = cmd.toLowerCase();
  for (const s of BLOCKED_SUBSTRINGS) {
    if (lower.includes(s)) return `禁止执行含「${s}」的命令`;
  }
  const match = cmd.match(/^(?:"([^"]+)"|'([^']+)'|([^\s]+))/);
  const first = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').replace(/["']/g, '');
  const base = first.split(/[\\/]/).pop()?.toLowerCase() ?? '';
  for (const verb of BLOCKED_VERBS) {
    if (base === verb || base.startsWith(`${verb}.`)) {
      return `安全拦截: 禁止执行命令「${verb}」`;
    }
  }
  return null;
}

/** 直通执行命令（确认后调用，绕过门禁二次排队；内部保留拦截黑名单） */
async function runExecCommand(args: Record<string, unknown>): Promise<string> {
  const cmd = String(args.command || '').trim();
  if (!cmd) return '错误: 命令不能为空';

  const blocked = blockedCommandReason(cmd);
  if (blocked) return blocked;

  try {
    const { execSync } = await import('node:child_process');
    const output = execSync(cmd, {
      cwd: process.cwd(),
      timeout: 30000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
    return output.slice(0, 2000).trim() || '命令执行成功（无输出）';
  } catch (err: any) {
    const msg = err.stderr || err.message || String(err);
    return `命令执行失败: ${msg.slice(0, 500)}`;
  }
}

/** 执行命令（安全沙箱） */
registerSkill({
  name: 'exec_command',
  description: '在本地电脑执行命令。当用户说"帮我跑""执行命令""打开XX""检查一下系统"时使用。仅允许非交互式命令，危险操作会被拦截。',
  args: [
    { name: 'command', type: 'string', required: true, description: '要执行的命令（如 dir, echo, git status 等非交互命令）' },
  ],
  risk: 'high',
  describe: (args) => `执行命令 ${String(args.command ?? '').trim() || '(空)'}`,
  execute: runExecCommand,
});
