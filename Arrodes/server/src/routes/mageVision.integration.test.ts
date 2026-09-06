import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let upstream: Server;
let backend: Server;
let base: string;
let healthy = true;
const received: unknown[] = [];
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  // Real HTTP hops with a deterministic inference double; no production DB or model weights.
  const sidecar = express();
  sidecar.use(express.json());
  sidecar.get('/health', (_req, res) => healthy
    ? res.json({ status: 'ready', model: 'test/Mage-VL', device: 'not-loaded' })
    : res.status(503).json({ status: 'error' }));
  sidecar.post('/analyze', (req, res) => {
    received.push(req.body);
    res.json({ text: '蓝色方块', duration_ms: 12, model: 'test/Mage-VL' });
  });
  upstream = createServer(sidecar);
  vi.stubEnv('VISION_PROVIDER', 'magevl');
  vi.stubEnv('MAGEVL_SIDECAR_URL', await listen(upstream));
  vi.resetModules();
  const { createVisionRouter } = await import('./vision.js');
  const app = express();
  app.use(express.json());
  app.use('/api/v1/vision', createVisionRouter());
  backend = createServer(app);
  base = await listen(backend);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await Promise.all([backend, upstream].filter(Boolean).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe('Mage-VL route → provider → sidecar HTTP contract', () => {
  it('returns readiness metadata through the public status route', async () => {
    const response = await fetch(`${base}/api/v1/vision/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: true, provider: 'magevl', state: 'ready', model: 'test/Mage-VL' });
  });

  it('forwards the image and prompt and maps the inference response', async () => {
    const image = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2048)]).toString('base64');
    const response = await fetch(`${base}/api/v1/vision/analyze-base64`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: image, imageFormat: 'png', prompt: '描述图片' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ description: '蓝色方块', model: 'test/Mage-VL' });
    expect(received).toEqual([{ image_base64: image, prompt: '描述图片' }]);
  });

  it('keeps status readable when the upstream is unavailable', async () => {
    healthy = false;
    const response = await fetch(`${base}/api/v1/vision/status`);
    const status = await response.json() as { available: boolean; error: string };
    expect(response.status).toBe(200);
    expect(status.available).toBe(false);
    expect(status.error).toContain('start-magevl.ps1');
  });
});
