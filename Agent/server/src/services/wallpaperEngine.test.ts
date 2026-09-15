import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  WallpaperEngine,
  WallpaperError,
  type ControlResult,
} from './wallpaperEngine.js';

const ORIG_ENV: Record<string, string | undefined> = {};
for (const key of ['ARRODES_WE_INSTALL', 'ARRODES_WE_WORKSHOP']) {
  ORIG_ENV[key] = process.env[key];
}
afterEach(() => {
  for (const key of Object.keys(ORIG_ENV)) {
    if (ORIG_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIG_ENV[key];
  }
});

interface FakeWallpaperSpec {
  id: string;
  title: string;
  preview?: string;
  tags?: string[];
  type?: string;
}

function makeWorkshop(root: string, specs: FakeWallpaperSpec[]): void {
  fs.mkdirSync(root, { recursive: true });
  for (const w of specs) {
    const dir = path.join(root, w.id);
    fs.mkdirSync(dir, { recursive: true });
    const pj = {
      title: w.title,
      type: w.type ?? 'Video',
      tags: w.tags ?? [],
      ...(w.preview ? { preview: w.preview } : {}),
    };
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(pj));
    if (w.preview) fs.writeFileSync(path.join(dir, w.preview), 'fake-image');
  }
}

function makeInstall(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'wallpaper64.exe'), 'x');
  fs.writeFileSync(path.join(root, 'wallpaper32.exe'), 'x');
}

function makeConfig(install: string, username: string, file: string): void {
  fs.writeFileSync(
    path.join(install, 'config.json'),
    JSON.stringify({
      [username]: {
        general: {
          wallpaperconfig: {
            selectedwallpapers: { Monitor0: { file } },
          },
        },
      },
    }),
  );
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-we-'));
}

describe('WallpaperEngine.listWallpapers', () => {
  it('列出合法壁纸并跳过无 project.json 的目录', () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    makeWorkshop(workshop, [
      { id: '1001', title: '壁纸A', preview: 'preview.jpg', tags: ['Anime'] },
      { id: '1002', title: '壁纸B', type: 'Scene' },
    ]);
    fs.mkdirSync(path.join(workshop, 'junk'));

    const we = new WallpaperEngine({
      installPath: path.join(root, 'install'),
      workshopPath: workshop,
    });
    const list = we.listWallpapers();
    expect(list).toHaveLength(2);
    const a = list.find((w) => w.id === '1001');
    expect(a).toMatchObject({
      id: '1001',
      title: '壁纸A',
      previewUrl: '/api/v1/wallpaper/preview/1001',
      tags: ['Anime'],
      type: 'Video',
    });
    expect(a?.previewPath).toBe(path.join(workshop, '1001', 'preview.jpg'));
    const b = list.find((w) => w.id === '1002');
    expect(b?.previewPath).toBeNull();
  });
});

describe('WallpaperEngine.getCurrent', () => {
  it('从 config.json 读取 Monitor0 当前壁纸', () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [{ id: '1001', title: '壁纸A', preview: 'preview.jpg' }]);
    makeConfig(install, 'tester', path.join(workshop, '1001', 'wall.mp4'));

    const we = new WallpaperEngine({ installPath: install, workshopPath: workshop });
    const cur = we.getCurrent();
    expect(cur?.id).toBe('1001');
    expect(cur?.title).toBe('壁纸A');
  });

  it('config.json 损坏时返回 null', () => {
    const root = tmpRoot();
    const install = path.join(root, 'install');
    makeInstall(install);
    fs.writeFileSync(path.join(install, 'config.json'), '{broken');
    const we = new WallpaperEngine({
      installPath: install,
      workshopPath: path.join(root, 'workshop'),
    });
    expect(we.getCurrent()).toBeNull();
  });

  it('config.json 用正斜杠、扫描结果用反斜杠时仍能匹配', () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [{ id: '1001', title: '壁纸A', preview: 'preview.jpg' }]);
    const fileWithForwardSlashes = path.join(workshop, '1001', 'wall.mp4').replace(/\\/g, '/');
    makeConfig(install, 'tester', fileWithForwardSlashes);

    const we = new WallpaperEngine({ installPath: install, workshopPath: workshop });
    const cur = we.getCurrent();
    expect(cur?.id).toBe('1001');
  });

  it('无 wallpaperconfig 时返回 null', () => {
    const root = tmpRoot();
    const install = path.join(root, 'install');
    makeInstall(install);
    fs.writeFileSync(
      path.join(install, 'config.json'),
      JSON.stringify({ tester: { general: {} } }),
    );
    const we = new WallpaperEngine({
      installPath: install,
      workshopPath: path.join(root, 'workshop'),
    });
    expect(we.getCurrent()).toBeNull();
  });
});

describe('WallpaperEngine.getOverview', () => {
  it('连接时返回 current 与 wallpapers', () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [{ id: '1001', title: '壁纸A' }]);
    makeConfig(install, 'tester', path.join(workshop, '1001', 'wall.mp4'));

    const we = new WallpaperEngine({ installPath: install, workshopPath: workshop });
    const overview = we.getOverview();
    expect(overview.connected).toBe(true);
    expect(overview.current?.id).toBe('1001');
    expect(overview.wallpapers).toHaveLength(1);
  });

  it('安装目录不存在时降级 connected=false', () => {
    const root = tmpRoot();
    const we = new WallpaperEngine({
      installPath: path.join(root, 'no-install'),
      workshopPath: path.join(root, 'workshop'),
    });
    const overview = we.getOverview();
    expect(overview.connected).toBe(false);
    expect(overview.current).toBeNull();
    expect(overview.wallpapers).toEqual([]);
  });
});

describe('WallpaperEngine.apply', () => {
  it('合法 id 调用 control 并成功', async () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [{ id: '1001', title: '壁纸A' }]);
    const calls: Array<{ exe: string; args: string[] }> = [];
    const control = async (exe: string, args: string[]): Promise<ControlResult> => {
      calls.push({ exe, args });
      return { exitCode: 0 };
    };
    const we = new WallpaperEngine({ installPath: install, workshopPath: workshop, control });

    await expect(we.apply('1001')).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual([
      '-control',
      'openWallpaper',
      '-file',
      path.join(workshop, '1001', 'project.json'),
    ]);
    expect(calls[0].exe).toContain('wallpaper64.exe');
  });

  it('非法 id 抛 400 且不调用 control', async () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [{ id: '1001', title: '壁纸A' }]);
    let called = false;
    const we = new WallpaperEngine({
      installPath: install,
      workshopPath: workshop,
      control: async () => {
        called = true;
        return { exitCode: 0 };
      },
    });

    await expect(we.apply('9999')).rejects.toMatchObject({ status: 400 });
    await expect(we.apply('../1001')).rejects.toMatchObject({ status: 400 });
    await expect(we.apply('..\\1001')).rejects.toMatchObject({ status: 400 });
    expect(called).toBe(false);
  });

  it('未安装时抛 502', async () => {
    const root = tmpRoot();
    const we = new WallpaperEngine({
      installPath: path.join(root, 'no-install'),
      workshopPath: path.join(root, 'workshop'),
    });
    await expect(we.apply('1001')).rejects.toMatchObject({ status: 502 });
  });

  it('control 非零退出抛 502 并带 stderr', async () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [{ id: '1001', title: '壁纸A' }]);
    const we = new WallpaperEngine({
      installPath: install,
      workshopPath: workshop,
      control: async () => ({ exitCode: 1, error: 'boom' }),
    });
    await expect(we.apply('1001')).rejects.toMatchObject({ status: 502, message: /boom/ });
  });
});

describe('WallpaperEngine.resolvePreview', () => {
  it('合法 id 返回预览路径与 MIME', () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [
      { id: '1001', title: 'JPG', preview: 'preview.jpg' },
      { id: '1002', title: 'PNG', preview: 'preview.png' },
    ]);
    const we = new WallpaperEngine({ installPath: install, workshopPath: workshop });
    const jpg = we.resolvePreview('1001');
    expect(jpg?.mime).toBe('image/jpeg');
    expect(jpg?.path).toBe(path.join(workshop, '1001', 'preview.jpg'));
    expect(we.resolvePreview('1002')?.mime).toBe('image/png');
  });

  it('非法或越权 id 返回 null', () => {
    const root = tmpRoot();
    const workshop = path.join(root, 'workshop');
    const install = path.join(root, 'install');
    makeInstall(install);
    makeWorkshop(workshop, [{ id: '1001', title: '壁纸A', preview: 'preview.jpg' }]);
    const we = new WallpaperEngine({ installPath: install, workshopPath: workshop });
    expect(we.resolvePreview('9999')).toBeNull();
    expect(we.resolvePreview('../secret')).toBeNull();
    expect(we.resolvePreview('..\\secret')).toBeNull();
  });
});

describe('WallpaperEngine 环境变量探测', () => {
  it('env 覆盖安装目录与 workshop 目录', () => {
    const root = tmpRoot();
    process.env.ARRODES_WE_INSTALL = path.join(root, 'env-install');
    process.env.ARRODES_WE_WORKSHOP = path.join(root, 'env-workshop');
    const we = new WallpaperEngine();
    expect(we.installPath).toBe(path.join(root, 'env-install'));
    expect(we.workshopPath).toBe(path.join(root, 'env-workshop'));
  });

  it('显式注入优先于 env', () => {
    const root = tmpRoot();
    process.env.ARRODES_WE_INSTALL = path.join(root, 'env-install');
    const we = new WallpaperEngine({
      installPath: path.join(root, 'explicit-install'),
      workshopPath: path.join(root, 'explicit-workshop'),
    });
    expect(we.installPath).toBe(path.join(root, 'explicit-install'));
  });
});

describe('WallpaperError', () => {
  it('携带 status 与 message', () => {
    const err = new WallpaperError(400, 'bad');
    expect(err.status).toBe(400);
    expect(err.message).toBe('bad');
  });
});
