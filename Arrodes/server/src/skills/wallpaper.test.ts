import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getAllSkills } from './registry.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-we-skill-'));
const install = path.join(root, 'install');
const workshop = path.join(root, 'workshop');

beforeAll(async () => {
  process.env.ARRODES_WE_INSTALL = install;
  process.env.ARRODES_WE_WORKSHOP = workshop;
  fs.mkdirSync(install, { recursive: true });
  fs.writeFileSync(path.join(install, 'wallpaper64.exe'), 'x');
  fs.writeFileSync(path.join(install, 'wallpaper32.exe'), 'x');
  fs.mkdirSync(path.join(workshop, '1001'), { recursive: true });
  fs.writeFileSync(
    path.join(workshop, '1001', 'project.json'),
    JSON.stringify({ title: '壁纸A', type: 'Video' }),
  );
  // 延迟加载，保证 env 已注入
  await import('./wallpaper.js');
});

afterAll(() => {
  delete process.env.ARRODES_WE_INSTALL;
  delete process.env.ARRODES_WE_WORKSHOP;
});

function skill() {
  return getAllSkills().find((s) => s.name === 'wallpaper')!;
}

describe('wallpaper 技能', () => {
  it('已注册且 apply 为高风险', () => {
    const s = skill();
    expect(s).toBeDefined();
    expect(s.risk).toBe('high');
    expect(s.args.some((a) => a.name === 'action' && a.required)).toBe(true);
  });

  it('list 返回壁纸列表', async () => {
    const result = await skill().execute({ action: 'list' });
    expect(result).toContain('壁纸A');
    expect(result).toContain('[1001]');
  });

  it('current 返回当前壁纸', async () => {
    fs.writeFileSync(
      path.join(install, 'config.json'),
      JSON.stringify({
        tester: {
          general: {
            wallpaperconfig: {
              selectedwallpapers: {
                Monitor0: { file: path.join(workshop, '1001', 'wall.mp4') },
              },
            },
          },
        },
      }),
    );
    const result = await skill().execute({ action: 'current' });
    expect(result).toContain('壁纸A');
  });

  it('apply 缺 id 返回提示', async () => {
    const result = await skill().execute({ action: 'apply' });
    expect(result).toContain('请提供壁纸 id');
  });

  it('apply 非法 id 返回可读错误（不抛异常）', async () => {
    const result = await skill().execute({ action: 'apply', id: '9999' });
    expect(result).toContain('操作失败');
    expect(result).toContain('400');
  });

  it('未知子命令返回用法', async () => {
    const result = await skill().execute({ action: 'xxx' });
    expect(result).toContain('list / current / apply');
  });

  it('WE 未安装时 list 降级提示', async () => {
    const prevInstall = process.env.ARRODES_WE_INSTALL;
    const prevWorkshop = process.env.ARRODES_WE_WORKSHOP;
    process.env.ARRODES_WE_INSTALL = path.join(root, 'gone');
    process.env.ARRODES_WE_WORKSHOP = path.join(root, 'gone-ws');
    try {
      const result = await skill().execute({ action: 'list' });
      expect(result).toContain('未安装或未运行');
    } finally {
      if (prevInstall) process.env.ARRODES_WE_INSTALL = prevInstall;
      else delete process.env.ARRODES_WE_INSTALL;
      if (prevWorkshop) process.env.ARRODES_WE_WORKSHOP = prevWorkshop;
      else delete process.env.ARRODES_WE_WORKSHOP;
    }
  });
});
