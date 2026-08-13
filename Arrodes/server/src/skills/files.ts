/**
 * 文件操作技能族（借鉴 Daisy-Voice-Agent 的能力面）
 *
 * 覆盖：list_directory / read_file / get_file_info（只读，低风险）
 *       write_file / create_file / delete_file / move_file / copy_file（写操作，高风险）
 *
 * 所有技能统一经 actionGate 分级授权：低风险自动执行，高风险生成待确认项。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { registerSkill, type SkillArg } from './registry.js';
import { actionGate } from '../services/actionGate.js';

interface FileSkillSpec {
  name: string;
  description: string;
  args: SkillArg[];
  describe: (args: Record<string, unknown>) => string;
  run: (args: Record<string, unknown>) => string;
}

/** 写/删/移动/复制时的系统路径保护（执行器内部防线） */
const DANGEROUS_SEGMENTS = [
  'C:\\Windows', 'C:\\Program Files', 'System32',
  '/etc', '/boot', '/usr', '/bin',
  '.bashrc', '.zshrc', '.env',
];

function guardMutate(abs: string): void {
  const normalized = abs.replace(/\\/g, '/').toLowerCase();
  for (const segment of DANGEROUS_SEGMENTS) {
    if (normalized.includes(segment.replace(/\\/g, '/').toLowerCase())) {
      throw new Error(`安全拦截: 禁止操作系统路径 "${segment}"`);
    }
  }
}

function resolvePath(input: unknown): string {
  const p = String(input ?? '').trim();
  if (!p) throw new Error('路径不能为空');
  return path.resolve(p);
}

function listDirectory(args: Record<string, unknown>): string {
  const dir = args.path ? resolvePath(args.path) : process.cwd();
  if (!fs.existsSync(dir)) throw new Error(`目录不存在: ${dir}`);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  if (entries.length === 0) return '目录为空';
  return entries
    .map((entry) => {
      const full = path.join(dir, entry.name);
      const kind = entry.isDirectory() ? '[目录]' : '[文件]';
      const size = entry.isDirectory() ? '-' : `${fs.statSync(full).size}B`;
      return `- ${kind} ${entry.name} ${size}`;
    })
    .join('\n');
}

function readFile(args: Record<string, unknown>): string {
  const filePath = resolvePath(args.path);
  const maxLines = Number(args.lines) || 50;

  const sensitive = ['.env', '.gitconfig', 'id_rsa', 'NTUSER.DAT', '.pfx', '.p12'];
  const fileName = path.basename(filePath).toLowerCase();
  if (sensitive.some((s) => fileName.includes(s.toLowerCase()))) {
    throw new Error('安全拦截: 禁止读取敏感配置文件');
  }

  if (!fs.existsSync(filePath)) throw new Error(`文件不存在: ${filePath}`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error(`不是文件: ${filePath}`);
  if (stat.size > 500 * 1024) throw new Error(`文件过大（${(stat.size / 1024).toFixed(1)}KB），最大 500KB`);

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const preview = lines.slice(0, maxLines).join('\n');
  const suffix = lines.length > maxLines ? `\n... (共 ${lines.length} 行，仅显示前 ${maxLines} 行)` : '';
  return `文件: ${filePath} (${(stat.size / 1024).toFixed(1)}KB, ${lines.length} 行)\n\`\`\`\n${preview}\n\`\`\`${suffix}`;
}

function getFileInfo(args: Record<string, unknown>): string {
  const filePath = resolvePath(args.path);
  if (!fs.existsSync(filePath)) throw new Error(`路径不存在: ${filePath}`);
  const stat = fs.statSync(filePath);
  return [
    `路径: ${filePath}`,
    `类型: ${stat.isDirectory() ? '目录' : '文件'}`,
    `大小: ${stat.size} 字节`,
    `修改时间: ${stat.mtime.toISOString()}`,
  ].join('\n');
}

function writeFile(args: Record<string, unknown>): string {
  const filePath = resolvePath(args.path);
  const content = String(args.content || '');
  const overwrite = args.overwrite === true;
  guardMutate(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!overwrite && fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, '\n' + content, 'utf-8');
    return `已追加写入 ${filePath}`;
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return `已写入 ${filePath} (${content.length} 字符)`;
}

function createFile(args: Record<string, unknown>): string {
  const filePath = resolvePath(args.path);
  const content = String(args.content ?? '');
  guardMutate(filePath);
  if (fs.existsSync(filePath)) throw new Error(`文件已存在: ${filePath}`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
  return `已创建 ${filePath}`;
}

function deleteFile(args: Record<string, unknown>): string {
  const filePath = resolvePath(args.path);
  guardMutate(filePath);
  if (!fs.existsSync(filePath)) throw new Error(`路径不存在: ${filePath}`);
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    if (fs.readdirSync(filePath).length > 0) throw new Error(`目录非空，拒绝删除: ${filePath}`);
    fs.rmdirSync(filePath);
    return `已删除空目录 ${filePath}`;
  }
  fs.unlinkSync(filePath);
  return `已删除文件 ${filePath}`;
}

function moveFile(args: Record<string, unknown>): string {
  const source = resolvePath(args.source);
  const target = resolvePath(args.target);
  guardMutate(target);
  if (!fs.existsSync(source)) throw new Error(`源不存在: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
  return `已移动 ${source} -> ${target}`;
}

function copyFile(args: Record<string, unknown>): string {
  const source = resolvePath(args.source);
  const target = resolvePath(args.target);
  guardMutate(target);
  if (!fs.existsSync(source)) throw new Error(`源不存在: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return `已复制 ${source} -> ${target}`;
}

function registerFileSkill(spec: FileSkillSpec): void {
  const run = async (args: Record<string, unknown>): Promise<string> => {
    try {
      return spec.run(args);
    } catch (err) {
      return `失败: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  registerSkill({
    name: spec.name,
    description: spec.description,
    args: spec.args,
    execute: async (args) => {
      const outcome = actionGate.request(spec.name, args, spec.describe(args), run);
      if (outcome.pending) {
        return `⚠️ 需要你确认：${outcome.pending.description}（ID: ${outcome.pending.id.slice(0, 8)}）。回复「确认」执行，回复「取消」拒绝。`;
      }
      return run(args);
    },
  });
}

registerFileSkill({
  name: 'list_directory',
  description: '列出指定目录下的文件和文件夹。当用户说"看看目录里有什么""列出文件"时使用。',
  args: [
    { name: 'path', type: 'string', required: false, description: '目录路径，默认当前工作目录' },
  ],
  describe: (args) => `列出目录 ${String(args.path ?? process.cwd())}`,
  run: listDirectory,
});

registerFileSkill({
  name: 'read_file',
  description: '读取本地文本文件内容。当用户说"看看这个文件""帮我读一下那个文件"时使用。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件路径' },
    { name: 'lines', type: 'number', required: false, description: '最多读取行数（默认 50）' },
  ],
  describe: (args) => `读取文件 ${String(args.path ?? '')}`,
  run: readFile,
});

registerFileSkill({
  name: 'get_file_info',
  description: '查看文件或目录的基本信息（类型、大小、修改时间）。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件或目录路径' },
  ],
  describe: (args) => `查看信息 ${String(args.path ?? '')}`,
  run: getFileInfo,
});

registerFileSkill({
  name: 'write_file',
  description: '写入内容到指定文件（默认追加，可覆盖）。当用户说"帮我写文件""保存到文件"时使用。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件路径' },
    { name: 'content', type: 'string', required: true, description: '要写入的内容' },
    { name: 'overwrite', type: 'boolean', required: false, description: '是否覆盖已有文件（默认 false 追加）' },
  ],
  describe: (args) => `写入文件 ${String(args.path ?? '')}`,
  run: writeFile,
});

registerFileSkill({
  name: 'create_file',
  description: '创建新文件（已存在则报错，避免误覆盖）。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件路径' },
    { name: 'content', type: 'string', required: false, description: '初始内容，默认空' },
  ],
  describe: (args) => `创建文件 ${String(args.path ?? '')}`,
  run: createFile,
});

registerFileSkill({
  name: 'delete_file',
  description: '删除指定文件或空目录（非空目录会拒绝删除）。',
  args: [
    { name: 'path', type: 'string', required: true, description: '要删除的文件或空目录路径' },
  ],
  describe: (args) => `删除 ${String(args.path ?? '')}`,
  run: deleteFile,
});

registerFileSkill({
  name: 'move_file',
  description: '移动或重命名文件。',
  args: [
    { name: 'source', type: 'string', required: true, description: '源路径' },
    { name: 'target', type: 'string', required: true, description: '目标路径' },
  ],
  describe: (args) => `移动 ${String(args.source ?? '')} -> ${String(args.target ?? '')}`,
  run: moveFile,
});

registerFileSkill({
  name: 'copy_file',
  description: '复制文件。',
  args: [
    { name: 'source', type: 'string', required: true, description: '源路径' },
    { name: 'target', type: 'string', required: true, description: '目标路径' },
  ],
  describe: (args) => `复制 ${String(args.source ?? '')} -> ${String(args.target ?? '')}`,
  run: copyFile,
});
