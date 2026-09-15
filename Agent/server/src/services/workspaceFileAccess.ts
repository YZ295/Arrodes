import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export function normalizeAuthorizedDirs(input: unknown): string[] {
  if (!Array.isArray(input)) throw new Error('authorizedDirs 必须是目录数组');
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('授权目录必须是非空路径');
    const dir = resolve(value.trim());
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`授权目录不存在或不是目录: ${dir}`);
    const key = process.platform === 'win32' ? dir.toLowerCase() : dir;
    if (!seen.has(key)) {
      seen.add(key);
      dirs.push(dir);
    }
  }
  return dirs;
}

export function workspaceAuthorizedRoots(workspace: { config: Record<string, unknown> }): string[] {
  const projectDir = typeof workspace.config.projectDir === 'string' && workspace.config.projectDir.trim()
    ? workspace.config.projectDir
    : undefined;
  const extras = Array.isArray(workspace.config.authorizedDirs) ? workspace.config.authorizedDirs : [];
  return normalizeAuthorizedDirs([...(projectDir ? [projectDir] : []), ...extras]);
}
