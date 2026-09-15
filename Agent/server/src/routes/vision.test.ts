import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createVisionRouter } from './vision.js';
import { visionService } from '../services/visionService.js';

const uploadDir = 'uploads/vision';
let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '14mb' }));
  app.use('/api/v1/vision', createVisionRouter());
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}/api/v1/vision`;
});

beforeEach(() => {
  vi.restoreAllMocks();
  if (existsSync(uploadDir)) rmSync(uploadDir, { recursive: true, force: true });
  mkdirSync(uploadDir, { recursive: true });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (existsSync(uploadDir)) rmSync(uploadDir, { recursive: true, force: true });
});

describe('视觉上传临时文件', () => {
  it('模型失败后仍清理上传的临时图片', async () => {
    vi.spyOn(visionService, 'analyze').mockRejectedValue(new Error('upstream unavailable'));
    const image = new Uint8Array(2048);
    image.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const form = new FormData();
    form.append('image', new Blob([image], { type: 'image/png' }), 'input.png');

    const response = await fetch(`${base}/analyze`, { method: 'POST', body: form });

    expect(response.status).toBe(500);
    expect(readdirSync(uploadDir)).toEqual([]);
  });
});
