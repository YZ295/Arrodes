import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

export interface AuthorizedPathOptions {
  /** 允许目标尚不存在；用于创建、写入、移动和复制的目标。 */
  allowMissing?: boolean;
}

function canonicalExistingPath(input: string, allowMissing: boolean): string {
  const absolute = resolve(input);
  if (existsSync(absolute)) return realpathSync.native(absolute);
  if (!allowMissing) throw new Error(`路径不存在: ${absolute}`);

  const missingSegments: string[] = [];
  let existingAncestor = absolute;
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) throw new Error(`路径不存在: ${absolute}`);
    missingSegments.unshift(existingAncestor.slice(parent.length).replace(/^[\\/]+/, ''));
    existingAncestor = parent;
  }
  return resolve(realpathSync.native(existingAncestor), ...missingSegments);
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * 返回用于实际文件系统操作的规范化路径；拒绝前缀碰撞、相对路径和符号链接逃逸。
 */
export function assertAuthorizedPath(
  input: string,
  roots: readonly string[],
  options: AuthorizedPathOptions = {},
): string {
  if (roots.length === 0) throw new Error('没有已授权的文件目录，请先选择项目文件夹或授权额外目录');
  const target = canonicalExistingPath(input, options.allowMissing === true);
  const canonicalRoots = roots.map((root) => {
    if (!existsSync(root)) throw new Error(`已授权目录不存在: ${root}`);
    return realpathSync.native(resolve(root));
  });
  if (!canonicalRoots.some((root) => isInside(root, target))) {
    throw new Error(`未获授权的文件路径: ${resolve(input)}`);
  }
  return target;
}
