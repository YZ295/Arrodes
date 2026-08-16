import { resolve } from 'node:path';

/** Agent 工作目录：优先工作区配置 projectDir，其次 ARRODES_REPO_ROOT，最后当前仓库 */
export function workspaceProjectDir(ws: { config: Record<string, unknown> }): string {
  const p = ws.config?.projectDir;
  if (typeof p === 'string' && p.trim()) return p;
  return process.env.ARRODES_REPO_ROOT || resolve(process.cwd(), '..', '..');
}
