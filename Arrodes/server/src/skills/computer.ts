/**
 * 电脑操作技能（操作电脑能力）
 *
 * 让阿罗德斯具备本地电脑操作：执行命令、读写文件、列目录。
 * 全部经 computerService 安全沙箱（黑名单拦截 + 超时 + 截断 + 文本限制）。
 *
 * 独立模块注册（不修改 builtin.ts，避免与外部工具改动冲突）。
 */
import { registerSkill } from './registry.js';
import {
  execCommand,
  formatCommandResult,
  readTextFile,
  writeTextFile,
  listDirectory,
} from '../services/computerService.js';

/** 执行命令（安全沙箱） */
registerSkill({
  name: 'exec_command',
  description: '在本地电脑执行命令。当用户说"帮我跑""执行命令""打开文件夹""检查一下系统""看看CPU内存"时使用。仅允许非交互式命令，危险操作会被拦截。',
  args: [
    { name: 'command', type: 'string', required: true, description: '要执行的命令（如 dir, echo, git status, ipconfig 等非交互命令）' },
  ],
  execute: async (args) => {
    const cmd = String(args.command || '').trim();
    if (!cmd) return '错误: 命令不能为空';
    try {
      const result = await execCommand(cmd);
      return formatCommandResult(result);
    } catch (err) {
      return err instanceof Error ? err.message : '命令执行失败';
    }
  },
});

/** 读取文本文件 */
registerSkill({
  name: 'read_file',
  description: '读取文本文件内容。当用户说"打开XX文件""看看XX文件内容""读取XX"时使用。限文本文件（md/txt/json/代码等），最大 200 行。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件路径（绝对路径或相对路径）' },
    { name: 'lines', type: 'number', required: false, description: '最多读取行数（默认 200）' },
  ],
  execute: async (args) => {
    const filePath = String(args.path || '').trim();
    if (!filePath) return '错误: 路径不能为空';
    try {
      const lines = typeof args.lines === 'number' ? Math.min(Math.max(args.lines, 1), 500) : 200;
      return readTextFile(filePath, lines);
    } catch (err) {
      return err instanceof Error ? `错误: ${err.message}` : '读取失败';
    }
  },
});

/** 写入文本文件 */
registerSkill({
  name: 'write_file',
  description: '写入/创建文本文件。当用户说"创建XX文件""把内容写到XX""保存XX"时使用。限文本文件，自动创建目录。',
  args: [
    { name: 'path', type: 'string', required: true, description: '文件路径' },
    { name: 'content', type: 'string', required: true, description: '要写入的内容' },
  ],
  execute: async (args) => {
    const filePath = String(args.path || '').trim();
    const content = String(args.content ?? '');
    if (!filePath) return '错误: 路径不能为空';
    try {
      writeTextFile(filePath, content);
      return `已写入 ${filePath}（${content.length} 字符）`;
    } catch (err) {
      return err instanceof Error ? `错误: ${err.message}` : '写入失败';
    }
  },
});

/** 列目录 */
registerSkill({
  name: 'list_dir',
  description: '列出目录内容。当用户说"看看这个文件夹里有什么""列出目录"时使用。',
  args: [
    { name: 'path', type: 'string', required: false, description: '目录路径（默认当前目录）' },
  ],
  execute: async (args) => {
    const dirPath = String(args.path || '.').trim() || '.';
    try {
      return listDirectory(dirPath);
    } catch (err) {
      return err instanceof Error ? `错误: ${err.message}` : '列目录失败';
    }
  },
});
