/**
 * WorkBuddy 网关适配器测试
 *
 * 用进程内 mock 网关验证：SSE 流式收集、401 认证提示、探测逻辑。
 */
import { createServer, type Server } from 'node:http';
import { describe, expect, it, afterAll } from 'vitest';
import { WorkBuddyGatewayAdapter, probeWorkbuddyGateway } from './workbuddyAdapter.js';

function startMockGateway(auth: boolean): Promise<{ url: string; close: () => void }> {
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '';
    if (auth && url.startsWith('/api/v1/')) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }));
      return;
    }
    if (url === '/api/v1/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (url === '/api/v1/runs') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ runId: 'run-1' }));
      return;
    }
    if (url === '/api/v1/runs/run-1/stream') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"text","text":"你好"}\n\n');
      res.write('data: {"type":"text","delta":"，我是 WorkBuddy"}\n\n');
      res.write('data: {"type":"done"}\n\n');
      res.end();
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ url: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`, close: () => server.close() });
    });
  });
}

const gateways: Array<{ close: () => void }> = [];
afterAll(() => {
  for (const g of gateways) g.close();
});

describe('WorkBuddy 网关适配器', () => {
  it('通过 SSE 流收集完整回复', async () => {
    const g = await startMockGateway(false);
    gateways.push(g);
    const adapter = new WorkBuddyGatewayAdapter(g.url, '');
    const reply = await adapter.run('你好', { cwd: 'E:/project' });
    expect(reply).toBe('你好，我是 WorkBuddy');
  });

  it('网关要求认证时给出明确的 token 提示', async () => {
    const g = await startMockGateway(true);
    gateways.push(g);
    const adapter = new WorkBuddyGatewayAdapter(g.url, '');
    const reply = await adapter.run('你好', { cwd: 'E:/project' });
    expect(reply).toContain('WORKBUDDY_GATEWAY_TOKEN');
  });

  it('探测：401 网关视为在线，无服务端口视为离线', async () => {
    const g = await startMockGateway(true);
    gateways.push(g);
    expect(await probeWorkbuddyGateway(g.url, '')).toBe(true);
    expect(await probeWorkbuddyGateway('http://127.0.0.1:1', '')).toBe(false);
  });

  it('网关不可达时返回可读错误', async () => {
    const adapter = new WorkBuddyGatewayAdapter('http://127.0.0.1:1', '');
    const reply = await adapter.run('你好', { cwd: 'E:/project' });
    expect(reply).toContain('WorkBuddy 网关不可达');
  });
});
