// T1 回归锁定：STT 路由（模式查询/切换 + 转写分发 + 错误码映射）
// T6 将在此基础上增加 per-request provider 覆盖（免提链路强制 local）
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSttRouter } from './stt.js';
import { transcribeAudio } from '../services/sttService.js';
import { getSttMode, setSttMode } from '../services/sttSettings.js';

vi.mock('../services/sttService.js', () => ({
  STT_MODES: ['online', 'local', 'auto'],
  isSttMode: (value: unknown): value is 'online' | 'local' | 'auto' =>
    value === 'online' || value === 'local' || value === 'auto',
  transcribeAudio: vi.fn(),
}));

vi.mock('../services/sttSettings.js', () => ({
  getSttMode: vi.fn(() => 'online'),
  setSttMode: vi.fn(),
}));

const mockedTranscribe = vi.mocked(transcribeAudio);
const mockedGetMode = vi.mocked(getSttMode);
const mockedSetMode = vi.mocked(setSttMode);

let server: Server;
let base: string;

beforeEach(() => {
  mockedTranscribe.mockReset();
  mockedSetMode.mockClear();
  mockedGetMode.mockReset().mockReturnValue('online');
});

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/stt', createSttRouter());
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}/api/v1/stt`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeAudioForm(): FormData {
  const form = new FormData();
  form.append('audio', new Blob([new Uint8Array(128)], { type: 'audio/webm' }), 'audio.webm');
  return form;
}

describe('STT 路由（T1 回归锁定）', () => {
  it('GET /status 返回可用性与当前模式', async () => {
    mockedGetMode.mockReturnValue('local');
    const res = await fetch(`${base}/status`);
    expect(res.ok).toBe(true);
    const data = await res.json() as { mode: string; provider: string };
    expect(data.mode).toBe('local');
    expect(data.provider).toBe('siliconflow');
  });

  it('GET /mode 返回模式列表', async () => {
    mockedGetMode.mockReturnValue('auto');
    const res = await fetch(`${base}/mode`);
    const data = await res.json() as { mode: string; modes: string[] };
    expect(data.mode).toBe('auto');
    expect(data.modes).toEqual(['online', 'local', 'auto']);
  });

  it('POST /mode 合法值持久化', async () => {
    const res = await fetch(`${base}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'local' }),
    });
    expect(res.ok).toBe(true);
    expect(mockedSetMode).toHaveBeenCalledWith('local');
  });

  it('POST /mode 非法值 400', async () => {
    const res = await fetch(`${base}/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'cloud' }),
    });
    expect(res.status).toBe(400);
    expect(mockedSetMode).not.toHaveBeenCalled();
  });

  it('POST /transcribe 缺少音频文件 400', async () => {
    const res = await fetch(`${base}/transcribe`, { method: 'POST' });
    expect(res.status).toBe(400);
    expect(mockedTranscribe).not.toHaveBeenCalled();
  });

  it('POST /transcribe 成功：按当前模式分发并返回 text/engine', async () => {
    mockedGetMode.mockReturnValue('local');
    mockedTranscribe.mockResolvedValue({ text: '识别结果', engine: 'local' });

    const res = await fetch(`${base}/transcribe`, { method: 'POST', body: makeAudioForm() });

    expect(res.ok).toBe(true);
    expect(mockedTranscribe).toHaveBeenCalledWith('local', expect.anything(), 'audio.webm', 'audio/webm', expect.anything());
    const data = await res.json() as { text: string; engine: string; usedFallback: boolean };
    expect(data).toEqual({ text: '识别结果', engine: 'local', usedFallback: false });
  });

  it('POST /transcribe 非法 provider → 回落持久化模式', async () => {
    mockedGetMode.mockReturnValue('online');
    mockedTranscribe.mockResolvedValue({ text: '在线识别', engine: 'online' });
    const form = makeAudioForm();
    form.append('provider', 'siliconflow');

    const res = await fetch(`${base}/transcribe`, { method: 'POST', body: form });

    expect(res.ok).toBe(true);
    expect(mockedTranscribe).toHaveBeenCalledWith('online', expect.anything(), 'audio.webm', 'audio/webm', expect.anything());
  });

  it('POST /transcribe 显式 provider=local 覆盖持久化模式（免提隐私，不回落云端）', async () => {
    mockedGetMode.mockReturnValue('online');
    mockedTranscribe.mockResolvedValue({ text: '本地识别', engine: 'local' });
    const form = makeAudioForm();
    form.append('provider', 'local');

    const res = await fetch(`${base}/transcribe`, { method: 'POST', body: form });

    expect(res.ok).toBe(true);
    expect(mockedTranscribe).toHaveBeenCalledWith('local', expect.anything(), 'audio.webm', 'audio/webm', expect.anything());
    const data = await res.json() as { engine: string };
    expect(data.engine).toBe('local');
  });

  it('POST /transcribe 未配置凭据 → 503', async () => {
    mockedGetMode.mockReturnValue('online');
    mockedTranscribe.mockRejectedValue(new Error('SILICONFLOW_API_KEY 未配置，无法使用在线识别'));

    const res = await fetch(`${base}/transcribe`, { method: 'POST', body: makeAudioForm() });

    expect(res.status).toBe(503);
  });

  it('POST /transcribe 未知异常 → 500', async () => {
    mockedGetMode.mockReturnValue('auto');
    mockedTranscribe.mockRejectedValue(new Error('本地与在线识别均失败。本地: x；在线: y'));

    const res = await fetch(`${base}/transcribe`, { method: 'POST', body: makeAudioForm() });

    expect(res.status).toBe(500);
  });
});
