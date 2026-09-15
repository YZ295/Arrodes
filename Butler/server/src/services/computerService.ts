/**
 * 电脑操作服务（安全沙箱）
 *
 * 为阿罗德斯提供本地电脑操作能力：
 * - 执行命令（异步 spawn，黑名单拦截 + 超时 + 输出截断）
 * - 读写文本文件、列目录（大小/类型限制）
 *
 * 安全原则：
 * 1. 危险命令黑名单拦截（宁可多拦，不可漏网）
 * 2. 所有操作有超时（默认 30s）
 * 3. 输出/文件内容截断（防刷屏/防大文件）
 * 4. 文件操作限文本、限大小
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { resolve, extname, dirname } from 'node:path';

// ===== 配置 =====

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_OUTPUT_CHARS = 2000;
const MAX_FILE_BYTES = 1024 * 1024; // 1MB
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.htm',
  '.py', '.c', '.cpp', '.h', '.java', '.go', '.rs', '.sh', '.ps1', '.bat', '.cmd',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.log', '.csv', '.xml', '.sql', '.env.example',
]);

/** 危险命令片段（子串匹配，大小写不敏感） */
const BLOCKED_PATTERNS = [
  // 删除/格式化
  'rm -rf', 'rm -fr', 'del /s', 'del /f', 'rmdir /s', 'format ', 'mkfs', 'diskpart',
  // 系统级破坏
  'shutdown', 'restart', 'reboot', 'reg delete', 'sc delete', 'bcdedit',
  'taskkill /f /im', 'net stop', 'net user', 'netsh', 'wmic process call terminate',
  // 危险重定向/管道
  '/dev/null >', '> nul', '2>nul', 'dd if=', 'mkfs', ':(){', 'rm -R',
  // 提权/凭据
  'sudo rm', 'chmod 777', 'attrib -r -s', 'net session', 'whoami /priv',
  // 挖矿/恶意
  'xmrig', 'minerd', 'curl http://', 'wget http://', 'powershell -enc', 'powershell -e ',
  '-exec bypass', 'iex(', 'invoke-expression',
];

/** 命令执行结果 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

// ===== 命令执行 =====

/**
 * 安全执行命令（异步非阻塞）
 * Windows 下经 powershell 执行以支持常见命令；危险命令在黑名单中被拦截。
 */
export function execCommand(
  command: string,
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<CommandResult> {
  const cmd = command.trim();
  if (!cmd) return Promise.reject(new Error('命令不能为空'));

  const blocked = BLOCKED_PATTERNS.find((p) => cmd.toLowerCase().includes(p.toLowerCase()));
  if (blocked) {
    return Promise.reject(new Error(`安全拦截: 命令包含危险操作「${blocked}」`));
  }

  return new Promise((resolvePromise) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const shell = process.platform === 'win32' ? 'powershell' : '/bin/sh';
    const shellArgs = process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-Command', cmd]
      : ['-c', cmd];

    const child = spawn(shell, shellArgs, {
      cwd: options.cwd ?? process.cwd(),
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs);

    child.stdout.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ stdout: '', stderr: err.message, exitCode: -1, timedOut, truncated: false });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let truncated = false;
      if (stdout.length > MAX_OUTPUT_CHARS) {
        stdout = stdout.slice(0, MAX_OUTPUT_CHARS);
        truncated = true;
      }
      resolvePromise({ stdout, stderr, exitCode: code, timedOut, truncated });
    });
  });
}

/** 格式化命令结果为技能返回文本 */
export function formatCommandResult(result: CommandResult): string {
  const parts: string[] = [];
  if (result.stdout.trim()) parts.push(result.stdout.trim());
  if (result.stderr.trim()) parts.push(`[stderr] ${result.stderr.trim()}`);
  if (result.timedOut) parts.push('（命令超时，已终止）');
  if (result.truncated) parts.push('（输出过长，已截断）');
  const status = result.exitCode === 0 ? '执行成功' : `退出码 ${result.exitCode}`;
  return (parts.join('\n') || status) + `\n[${status}]`;
}

// ===== 文件操作 =====

/** 安全读文本文件（限文本类型 + 1MB） */
export function readTextFile(filePath: string, maxLines = 200): string {
  if (!existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);
  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_BYTES) throw new Error('文件超过 1MB，拒绝读取');
  const ext = extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`非文本文件（${ext || '无扩展名'}），拒绝读取`);
  }
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).join('\n') + `\n…（共 ${lines.length} 行，仅显示前 ${maxLines} 行）`;
  }
  return content;
}

/** 安全写文本文件（限文本类型 + 1MB，自动建目录） */
export function writeTextFile(filePath: string, content: string): void {
  const ext = extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error(`非文本扩展名（${ext || '无扩展名'}），拒绝写入`);
  }
  if (content.length > MAX_FILE_BYTES) throw new Error('内容超过 1MB，拒绝写入');
  const absolute = resolve(filePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf-8');
}

/** 列目录（名称 + 类型 + 大小），限深度 1 层 */
export function listDirectory(dirPath: string): string {
  if (!existsSync(dirPath)) throw new Error(`目录不存在: ${dirPath}`);
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const lines = entries.slice(0, 100).map((e) => {
    const full = resolve(dirPath, e.name);
    const isDir = e.isDirectory();
    let size = '';
    if (!isDir) {
      try { size = ` ${statSync(full).size}B`; } catch { /* ignore */ }
    }
    return `${isDir ? '[DIR]' : '     '} ${e.name}${size}`;
  });
  if (entries.length > 100) lines.push(`…（共 ${entries.length} 项，仅显示前 100 项）`);
  return lines.join('\n');
}
