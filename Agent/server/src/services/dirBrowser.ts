import { resolve, dirname } from 'node:path';
import { getFsProvider } from './fsProvider.js';

export interface DirBrowseResult {
  path: string;
  parent: string | null;
  dirs: string[];
  /** 可用驱动器根（Windows 为 C:/、D:/…，非 Windows 为 /） */
  roots: string[];
}

/** 列出系统可用驱动器（Windows 枚举 C:-Z:，非 Windows 返回根目录） */
export function listDriveRoots(): string[] {
  const provider = getFsProvider();
  if (process.platform !== 'win32') {
    return ['/'];
  }
  const roots: string[] = [];
  for (let code = 67; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:/`;
    try {
      if (provider.exists(root)) roots.push(root);
    } catch {
      // 无权限或无效盘符则跳过
    }
  }
  return roots;
}

export function listDirectories(dir: string): DirBrowseResult {
  const p = resolve(dir || process.cwd());
  const entries = getFsProvider().readdir(p);
  const dirs = entries
    .filter((e) => e.isDirectory)
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
  const parentDir = dirname(p);
  const parent = parentDir === p ? null : parentDir;
  return { path: p, parent, dirs, roots: listDriveRoots() };
}
