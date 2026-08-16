import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { listDirectories } from './dirBrowser.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-browse-'));
fs.mkdirSync(path.join(tmp, 'sub1'));
fs.mkdirSync(path.join(tmp, 'sub2'));
fs.writeFileSync(path.join(tmp, 'a.txt'), 'x');

describe('listDirectories（项目文件夹选择）', () => {
  it('只列目录、含上级路径、不列文件', () => {
    const r = listDirectories(tmp);
    expect(r.dirs).toEqual(expect.arrayContaining(['sub1', 'sub2']));
    expect(r.dirs).not.toContain('a.txt');
    expect(r.parent).toBe(path.dirname(tmp));
  });

  it('盘符根目录没有上级', () => {
    const root = path.parse(tmp).root;
    const r = listDirectories(root);
    expect(r.parent).toBeNull();
  });
});
