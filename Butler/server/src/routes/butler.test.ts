/**
 * /api/v1/butler 路由测试：接线 + 校验 + 错误映射
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createButlerRouter } from './butler.js';
import type { ButlerService } from '../services/butlerService.js';

/** 极简假服务：只验证路由接线与错误映射，业务逻辑由 butlerService.test.ts 覆盖 */
const calls: string[] = [];
const fakeService = {
  getStatus: () => {
    calls.push('status');
    return {
      dataDir: 'X:\\fake',
      engine: { running: true, pid: 1234, source: 'external', managed: false, startedAt: '2026-09-08T20:00:00+08:00' },
      state: { summarizing: true, queue: 3, current: { date: '20260908', start: '18:00', end: '18:10' }, updatedAt: '2026-09-08T21:00:00+08:00', stale: false },
    };
  },
  start: async () => ({ ok: false as const, code: 'ALREADY_RUNNING' as const, reason: '引擎已由外部实例运行（pid 1234）' }),
  stop: async () => ({ ok: false as const, code: 'NOT_RUNNING' as const, reason: '引擎未在运行' }),
  recentRecords: () => [{ ts: '2026-09-08T21:00:00+08:00', status: 'raw' }],
  summaryDates: () => ['20260908'],
  summaryDay: (ymd: string) =>
    ymd === '20260908'
      ? { date: '2026-09-08', segments: [{ idx: 108, start: '18:00', end: '18:10', status: 'done', project: '写管家集成', category: '工作' }] }
      : { date: ymd, segments: [] },
  dispose: () => { /* noop */ },
} as unknown as ButlerService;

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/butler', createButlerRouter(fakeService));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}/api/v1/butler`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('GET /api/v1/butler/*', () => {
  it('status 返回引擎/状态结构', async () => {
    const res = await fetch(`${base}/status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      engine: { running: boolean; source: string; pid: number | null };
      state: { summarizing: boolean; stale: boolean };
    };
    expect(body.engine.running).toBe(true);
    expect(body.engine.source).toBe('external');
    expect(body.state.summarizing).toBe(true);
  });

  it('records/recent 返回记录数组', async () => {
    const res = await fetch(`${base}/records/recent`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { records: Array<{ ts: string }> };
    expect(body.records).toHaveLength(1);
    expect(body.records[0].ts).toBe('2026-09-08T21:00:00+08:00');
  });

  it('summary/dates 返回日期列表', async () => {
    const res = await fetch(`${base}/summary/dates`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dates: string[] }).dates).toEqual(['20260908']);
  });

  it('summary/day 合法日期返回段', async () => {
    const res = await fetch(`${base}/summary/day?ymd=20260908`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { segments: Array<{ project: string }> };
    expect(body.segments[0].project).toBe('写管家集成');
  });

  it('summary/day 非法日期 → 400', async () => {
    for (const bad of ['', 'notadate', '2026-9-8', '2026090', '202609088', '../20260908']) {
      const res = await fetch(`${base}/summary/day?ymd=${encodeURIComponent(bad)}`);
      expect(res.status, `ymd=${bad}`).toBe(400);
    }
  });
});

describe('POST /api/v1/butler/start|stop 错误映射', () => {
  it('start 冲突 → 409 + error 文案（客户端可直接展示）', async () => {
    const res = await fetch(`${base}/start`, { method: 'POST' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe('ALREADY_RUNNING');
    expect(body.error).toContain('引擎已由外部实例运行');
  });

  it('stop 未运行 → 409 + error 文案', async () => {
    const res = await fetch(`${base}/stop`, { method: 'POST' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe('NOT_RUNNING');
  });
});
