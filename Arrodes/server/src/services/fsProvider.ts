/**
 * 文件系统能力 seam（借鉴 DeepSeek Harness：Definition / Provider / Consumer）
 *
 * - FsProvider：Service Definition（接口）
 * - LocalFsProvider：Service Provider（node:fs 实现）
 * - Consumer：skills/files.ts 文件技能
 *
 * 换 Provider 即可整体切换文件执行世界（例如未来指向远程沙箱）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FsDirEntry {
  name: string;
  isDirectory: boolean;
  size: number;
}

export interface FsStat {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
}

export interface FsProvider {
  exists(p: string): boolean;
  readdir(dir: string): FsDirEntry[];
  stat(p: string): FsStat;
  readFile(p: string): string;
  mkdirp(dir: string): void;
  appendFile(p: string, content: string): void;
  writeFile(p: string, content: string): void;
  rmdir(p: string): void;
  unlink(p: string): void;
  rename(source: string, target: string): void;
  copyFile(source: string, target: string): void;
}

export class LocalFsProvider implements FsProvider {
  exists(p: string): boolean {
    return fs.existsSync(p);
  }

  readdir(dir: string): FsDirEntry[] {
    return fs.readdirSync(dir, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      size: entry.isDirectory() ? 0 : fs.statSync(path.join(dir, entry.name)).size,
    }));
  }

  stat(p: string): FsStat {
    const s = fs.statSync(p);
    return {
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      size: s.size,
      mtimeMs: s.mtimeMs,
    };
  }

  readFile(p: string): string {
    return fs.readFileSync(p, 'utf-8');
  }

  mkdirp(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }

  appendFile(p: string, content: string): void {
    fs.appendFileSync(p, content, 'utf-8');
  }

  writeFile(p: string, content: string): void {
    fs.writeFileSync(p, content, 'utf-8');
  }

  rmdir(p: string): void {
    fs.rmdirSync(p);
  }

  unlink(p: string): void {
    fs.unlinkSync(p);
  }

  rename(source: string, target: string): void {
    fs.renameSync(source, target);
  }

  copyFile(source: string, target: string): void {
    fs.copyFileSync(source, target);
  }
}

let provider: FsProvider = new LocalFsProvider();

export function getFsProvider(): FsProvider {
  return provider;
}

export function setFsProvider(p: FsProvider): void {
  provider = p;
}
