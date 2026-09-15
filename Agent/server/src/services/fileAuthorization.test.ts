import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertAuthorizedPath } from './fileAuthorization.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-file-auth-root-'));
const sibling = `${root}-sibling`;
fs.mkdirSync(sibling);
fs.mkdirSync(path.join(root, 'nested'));

describe('文件目录授权', () => {
  it('允许项目根和显式额外目录中的路径', () => {
    const extra = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-file-auth-extra-'));
    expect(assertAuthorizedPath(path.join(root, 'nested', 'new.txt'), [root, extra], { allowMissing: true }))
      .toBe(path.join(root, 'nested', 'new.txt'));
    expect(assertAuthorizedPath(path.join(extra, 'note.txt'), [root, extra], { allowMissing: true }))
      .toBe(path.join(extra, 'note.txt'));
  });

  it('拒绝相同前缀的相邻目录和相对路径逃逸', () => {
    expect(() => assertAuthorizedPath(path.join(sibling, 'secret.txt'), [root], { allowMissing: true }))
      .toThrow(/未获授权/);
    expect(() => assertAuthorizedPath(path.join(root, '..', path.basename(sibling), 'secret.txt'), [root], { allowMissing: true }))
      .toThrow(/未获授权/);
  });

  it('拒绝经由符号链接离开授权根', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-file-auth-outside-'));
    const link = path.join(root, 'outside-link');
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }
    expect(() => assertAuthorizedPath(path.join(link, 'secret.txt'), [root], { allowMissing: true }))
      .toThrow(/未获授权/);
  });
});
