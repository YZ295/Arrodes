/**
 * 可精炼外壳（Prompt Shell）—— 借鉴 Prime Agent "不可变核心 + 可演进外壳"
 *
 * 分层理念：
 * - 不可变核心：SYSTEM_PROMPT（人设/四戒/说话方式），代码内置，永不重写
 * - 可精炼外壳：shell.json 存储可变补充提示（用户偏好/临时指令/环境上下文），
 *   版本化 + 快照回滚，LLM/管理员可增量更新
 *
 * 请求时：核心 + 外壳合并注入系统提示。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 每次调用读取 env（测试隔离：可注入 PROMPT_SHELL_FILE） */
function getShellFile(): string {
  return process.env.PROMPT_SHELL_FILE
    ? resolve(process.env.PROMPT_SHELL_FILE)
    : join(resolve(__dirname, '../data/prompt-shell'), 'shell.json');
}

interface PromptShell {
  /** 版本号（每次更新 +1） */
  version: number;
  /** 更新描述 */
  updatedAt: string;
  /** 当前外壳提示数组（合并注入） */
  entries: string[];
}

const EMPTY_SHELL: PromptShell = { version: 0, updatedAt: '', entries: [] };

function loadShell(): PromptShell {
  try {
    if (!existsSync(getShellFile())) return { ...EMPTY_SHELL };
    const raw = JSON.parse(readFileSync(getShellFile(), 'utf-8')) as Partial<PromptShell>;
    return {
      version: raw.version ?? 0,
      updatedAt: raw.updatedAt ?? '',
      entries: Array.isArray(raw.entries) ? raw.entries : [],
    };
  } catch {
    return { ...EMPTY_SHELL };
  }
}

/** 备份当前 shell 为版本快照（回滚用） */
function snapshot(version: number): void {
  try {
    mkdirSync(dirname(getShellFile()), { recursive: true });
    const from = getShellFile();
    const to = join(dirname(getShellFile()), `shell.v${version}.json`);
    if (existsSync(from) && !existsSync(to)) {
      writeFileSync(to, readFileSync(from, 'utf-8'), 'utf-8');
    }
  } catch { /* 快照失败不阻塞 */ }
}

/**
 * 追加/更新外壳提示（增量，小步）
 * 返回新版本号
 */
export function updatePromptShell(entry: string): number {
  const shell = loadShell();
  snapshot(shell.version);
  const next: PromptShell = {
    version: shell.version + 1,
    updatedAt: new Date().toISOString(),
    entries: [...shell.entries.filter((e) => e !== entry), entry],
  };
  mkdirSync(dirname(getShellFile()), { recursive: true });
  writeFileSync(getShellFile(), JSON.stringify(next, null, 2), 'utf-8');
  return next.version;
}

/** 删除某条外壳提示（按内容精确匹配） */
export function removePromptShellEntry(entry: string): number {
  const shell = loadShell();
  if (!shell.entries.includes(entry)) return shell.version;
  snapshot(shell.version);
  const next: PromptShell = { ...shell, version: shell.version + 1, updatedAt: new Date().toISOString() };
  next.entries = shell.entries.filter((e) => e !== entry);
  writeFileSync(getShellFile(), JSON.stringify(next, null, 2), 'utf-8');
  return next.version;
}

/** 回滚到指定版本快照（或最近一次） */
export function rollbackPromptShell(targetVersion?: number): number {
  const versions = readdirSync(dirname(getShellFile()))
    .filter((f) => /^shell\.v\d+\.json$/.test(f))
    .map((f) => Number(f.match(/^shell\.v(\d+)\.json$/)?.[1] || 0))
    .sort((a, b) => b - a);

  if (versions.length === 0) return 0;
  const v = targetVersion ?? versions[0];
  const snapshotPath = join(dirname(getShellFile()), `shell.v${v}.json`);
  if (!existsSync(snapshotPath)) return loadShell().version;

  const restored = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as PromptShell;
  writeFileSync(getShellFile(), JSON.stringify(restored, null, 2), 'utf-8');
  return restored.version;
}

/** 获取当前外壳提示（合并成字符串，空则返回空串） */
export function getPromptShellText(): string {
  const shell = loadShell();
  if (shell.entries.length === 0) return '';
  return `\n【补充指令（可回滚）】\n${shell.entries.join('\n')}\n`;
}

/** 获取外壳状态（诊断） */
export function getPromptShellState(): PromptShell {
  return loadShell();
}
