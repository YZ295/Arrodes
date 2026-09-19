/**
 * 命令执行技能（结构化拦截 + actionGate 分级授权）
 */
import { registerSkill } from './registry.js';
import { getCommandProvider } from '../services/commandProvider.js';
import {
  getSoftwareProvider,
  setSoftwareProvider,
  type SoftwareProvider,
} from '../services/softwareProvider.js';

export { setSoftwareProvider, type SoftwareProvider };

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

  const outcome = getCommandProvider().run(cmd, {
    cwd: process.cwd(),
    timeoutMs: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (outcome.exitCode !== 0) {
    return `命令执行失败: ${outcome.stderr.slice(0, 500)}`;
  }
  return outcome.stdout.slice(0, 2000).trim() || '命令执行成功（无输出）';
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

function exactPackageId(input: unknown): string {
  const packageId = String(input ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]{1,199}$/.test(packageId)) {
    throw new Error('软件 ID 格式无效；请使用 winget 的精确 package ID');
  }
  return packageId;
}

async function uninstallSoftware(args: Record<string, unknown>): Promise<string> {
  const packageId = exactPackageId(args.packageId);
  const provider = getSoftwareProvider();
  if (!provider.isInstalled(packageId)) {
    return `未检测到软件 ${packageId}，未执行卸载。`;
  }

  const outcome = provider.uninstall(packageId);
  if (outcome.exitCode !== 0) {
    throw new Error(`卸载命令失败（exit ${outcome.exitCode}）：${outcome.output.slice(0, 500)}`);
  }
  // Winget 的卸载器可能在父进程退出后短暂异步清理注册信息。
  // 最多复查三次；真实 provider 的每次 winget 查询本身会提供短暂等待。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!provider.isInstalled(packageId)) return `已卸载并核验：${packageId}`;
  }
  throw new Error(`卸载后仍检测到软件 ${packageId}，不能判定任务完成`);
}

registerSkill({
  name: 'uninstall_software',
  description: '按 winget 精确软件 ID 卸载软件；执行后会重新查询，确认软件确实不存在。',
  args: [
    { name: 'packageId', type: 'string', required: true, description: 'winget 精确软件 ID，例如 Vendor.Product' },
  ],
  risk: 'high',
  describe: (args) => `卸载软件 ${String(args.packageId ?? '').trim() || '(未指定)'}`,
  execute: uninstallSoftware,
});
