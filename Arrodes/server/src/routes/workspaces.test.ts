import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { workspaceRepo } from '../db/workspace-repo.js';
import { createWorkspacesRouter } from './workspaces.js';

let server: Server;
let base: string;

beforeAll(async () => {
  closeDb();
  setDbPathForTests(':memory:');
  initSchema();
  const app = express();
  app.use(express.json());
  app.use('/api/v1/workspaces', createWorkspacesRouter());
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}/api/v1/workspaces`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
});

describe('工作区文件授权配置', () => {
  it('拒绝通过通用 config 绕过受保护的文件授权字段', async () => {
    const workspace = workspaceRepo.create({ name: '授权测试' });

    const response = await fetch(`${base}/${workspace.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { authorizedDirs: ['E:/outside'] } }),
    });

    expect(response.status).toBe(400);
    expect(workspaceRepo.get(workspace.id)?.config.authorizedDirs).toBeUndefined();
  });
});
