import { resolve } from 'node:path';

/** 仓库根目录（server 运行时 cwd = server 目录；可用 ARRODES_REPO_ROOT 覆盖） */
export function repoRoot(): string {
  return process.env.ARRODES_REPO_ROOT || resolve(process.cwd(), '..', '..');
}
