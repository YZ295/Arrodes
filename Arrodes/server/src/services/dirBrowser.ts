import { resolve, dirname } from 'node:path';
import { getFsProvider } from './fsProvider.js';

export interface DirBrowseResult {
  path: string;
  parent: string | null;
  dirs: string[];
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
  return { path: p, parent, dirs };
}
