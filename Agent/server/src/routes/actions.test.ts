import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { SessionRepository } from '../db/session-repo.js';
import { actionGate } from '../services/actionGate.js';
import { createActionsRouter } from './actions.js';

let server: Server;
let base: string;
let sessionA: string;
let sessionB: string;

beforeAll(async () => {
  closeDb();
  setDbPathForTests(':memory:');
  initSchema();
  const sessions = new SessionRepository();
  sessionA = sessions.create({ title: 'A', topic: 'work', workspaceId: 'workspace-a' }).id;
  sessionB = sessions.create({ title: 'B', topic: 'work', workspaceId: 'workspace-b' }).id;

  const app = express();
  app.use(express.json());
  app.use('/api/v1/actions', createActionsRouter());
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}/api/v1/actions`;
});

beforeEach(() => {
  for (const item of actionGate.list()) actionGate.deny(item.id);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
});

describe('动作确认 API 的会话归属', () => {
  it('会话 B 不能查看、确认或取消会话 A 的待确认动作', async () => {
    const pending = actionGate.request(
      'type_text',
      { text: 'private text' },
      '输入私有文本',
      async () => 'done',
      { localUserId: 'local-user', workspaceId: 'workspace-a', sessionId: sessionA },
    ).pending!;

    const listB = await fetch(`${base}/pending?sessionId=${encodeURIComponent(sessionB)}`);
    expect(listB.status).toBe(200);
    expect((await listB.json() as { pending: unknown[] }).pending).toEqual([]);

    const confirmB = await fetch(`${base}/${pending.id}/confirm`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionB }),
    });
    expect(confirmB.status).toBe(404);
    expect(actionGate.get(pending.id)).toBeTruthy();

    const cancelA = await fetch(`${base}/${pending.id}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionA }),
    });
    expect(cancelA.status).toBe(200);
  });
});
