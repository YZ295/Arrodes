import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createWallpaperRouter } from './wallpaper.js';
import {
  WallpaperEngine,
  type ControlResult,
} from '../services/wallpaperEngine.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-we-route-'));
const install = path.join(root, 'install');
const workshop = path.join(root, 'workshop');

fs.mkdirSync(install, { recursive: true });
fs.writeFileSync(path.join(install, 'wallpaper64.exe'), 'x');
fs.writeFileSync(path.join(install, 'wallpaper32.exe'), 'x');
fs.mkdirSync(path.join(workshop, '1001'), { recursive: true });
fs.writeFileSync(
  path.join(workshop, '1001', 'project.json'),
  JSON.stringify({ title: '壁纸A', preview: 'preview.jpg' }),
);
fs.writeFileSync(path.join(workshop, '1001', 'preview.jpg'), 'FAKE-JPEG');
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

const applied: Array<{ id: string; monitor?: number }> = [];
const engine = new WallpaperEngine({
  installPath: install,
  workshopPath: workshop,
  control: async (_exe: string, _args: string[]): Promise<ControlResult> => {
    return { exitCode: 0 };
  },
});
const realApply = engine.apply.bind(engine);
engine.apply = async (id: string, monitor?: number) => {
  applied.push({ id, monitor });
  return realApply(id, monitor);
};

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/wallpaper', createWallpaperRouter(engine));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api/v1/wallpaper`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/v1/wallpaper', () => {
  it('返回 connected/current/wallpapers', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connected: boolean;
      current: { id: string } | null;
      wallpapers: Array<{ id: string; title: string }>;
    };
    expect(body.connected).toBe(true);
    expect(body.current?.id).toBe('1001');
    expect(body.wallpapers).toHaveLength(1);
    expect(body.wallpapers[0].title).toBe('壁纸A');
  });
});

describe('POST /api/v1/wallpaper/apply', () => {
  it('合法 id 返回 200 并调用引擎', async () => {
    const res = await fetch(`${base}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '1001' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(body.id).toBe('1001');
    expect(applied.at(-1)).toEqual({ id: '1001' });
  });

  it('缺 id 返回 400', async () => {
    const res = await fetch(`${base}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('非法 id 返回 400', async () => {
    const res = await fetch(`${base}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '../secret' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/wallpaper/preview/:id', () => {
  it('合法 id 返回图片与 Cache-Control', async () => {
    const res = await fetch(`${base}/preview/1001`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    expect(await res.text()).toBe('FAKE-JPEG');
  });

  it('未知 id 返回 404', async () => {
    const res = await fetch(`${base}/preview/9999`);
    expect(res.status).toBe(404);
  });

  it('越权路径返回 404', async () => {
    const res = await fetch(`${base}/preview/..%2F..%2Fsecret`);
    expect(res.status).toBe(404);
  });
});
