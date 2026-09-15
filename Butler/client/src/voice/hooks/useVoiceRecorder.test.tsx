// @vitest-environment jsdom
// T1 回归锁定：录音→服务端转写→sendMessage 链路（T6 将在此基础上加 provider 参数）
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceRecorder, type VoiceRecorderApi } from './useVoiceRecorder';
import { eventBus, EVENTS } from '../../shared/events/EventBus';

const h = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
  startListening: vi.fn(),
  stopListening: vi.fn(),
}));

vi.mock('./useAudioRecorder', () => ({
  useAudioRecorder: () => ({
    isRecording: false, duration: 0, volume: 0,
    startRecording: h.startRecording, stopRecording: h.stopRecording, error: null,
  }),
}));

vi.mock('./useSpeechToText', () => ({
  useSpeechToText: () => ({
    interimText: '', startListening: h.startListening, stopListening: h.stopListening, error: null,
  }),
}));

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let latest: VoiceRecorderApi | null = null;

function Harness({ provider }: { provider?: 'local' | 'online' | 'auto' }) {
  latest = useVoiceRecorder({
    sendMessage: h.sendMessage,
    getSessionId: () => 's-1',
    ...(provider ? { sttProvider: provider } : {}),
  });
  return null;
}

function lastFetchBody(): FormData {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
  return init?.body as FormData;
}

function setUA(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  h.sendMessage.mockClear();
  h.startRecording.mockClear().mockResolvedValue(undefined);
  h.stopRecording.mockClear();
  h.startListening.mockClear().mockResolvedValue('');
  h.stopListening.mockClear();
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/api/v1/stt/transcribe') {
      return { ok: true, json: async () => ({ text: ' 你好呀 ' }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  latest = null;
  vi.unstubAllGlobals();
});

async function renderAndStop() {
  await act(async () => root.render(<Harness />));
  await act(async () => { latest!.startRecording(); });
  await act(async () => { latest!.stopRecording(); });
  await vi.waitFor(() => expect(h.sendMessage).toHaveBeenCalled());
}

describe('useVoiceRecorder（T1 回归锁定）', () => {
  it('录音上传服务端转写成功 → sendMessage(text, true) + VOICE_RECORDING_END', async () => {
    setUA('Mozilla/5.0 (non-electron)');
    h.stopRecording.mockResolvedValue(new Blob(['audio-bytes'], { type: 'audio/webm' }));
    const endSpy = vi.fn();
    eventBus.on(EVENTS.VOICE_RECORDING_END, endSpy);

    await renderAndStop();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/stt/transcribe', expect.objectContaining({ method: 'POST' }));
    expect(h.sendMessage).toHaveBeenCalledWith('你好呀', true);
    expect(endSpy).toHaveBeenCalledWith(expect.objectContaining({ text: '你好呀', sessionId: 's-1' }));
  });

  it('Electron 壳内跳过浏览器实时 STT，仅走服务端', async () => {
    setUA('Mozilla/5.0 AppleWebKit Electron/33');
    h.stopRecording.mockResolvedValue(new Blob(['audio-bytes'], { type: 'audio/webm' }));

    await renderAndStop();

    expect(h.startListening).not.toHaveBeenCalled();
    expect(h.sendMessage).toHaveBeenCalledWith('你好呀', true);
  });

  it('服务端转写失败 → 回退浏览器 STT 文本', async () => {
    setUA('Mozilla/5.0 (non-electron)');
    h.stopRecording.mockResolvedValue(new Blob(['audio-bytes'], { type: 'audio/webm' }));
    h.startListening.mockResolvedValue('浏览器识别的文本');
    fetchMock = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await renderAndStop();

    expect(h.sendMessage).toHaveBeenCalledWith('浏览器识别的文本', true);
  });

  it('服务端与浏览器 STT 都无文本 → 占位 [语音消息]', async () => {
    setUA('Mozilla/5.0 (non-electron)');
    h.stopRecording.mockResolvedValue(new Blob(['audio-bytes'], { type: 'audio/webm' }));
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ text: '' }) } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await renderAndStop();

    expect(h.sendMessage).toHaveBeenCalledWith('[语音消息]', true);
  });

  it('空录音（无 Blob）→ 直接走浏览器 STT 回退', async () => {
    setUA('Mozilla/5.0 (non-electron)');
    h.stopRecording.mockResolvedValue(null);
    h.startListening.mockResolvedValue('只有浏览器文本');

    await renderAndStop();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.sendMessage).toHaveBeenCalledWith('只有浏览器文本', true);
  });

  it('T6: sttProvider=local → 转写请求携带 provider 字段（免提强制本地）', async () => {
    setUA('Mozilla/5.0 AppleWebKit Electron/33');
    h.stopRecording.mockResolvedValue(new Blob(['audio-bytes'], { type: 'audio/webm' }));

    await act(async () => root.render(<Harness provider="local" />));
    await act(async () => { latest!.startRecording(); });
    await act(async () => { latest!.stopRecording(); });
    await vi.waitFor(() => expect(h.sendMessage).toHaveBeenCalled());

    const form = lastFetchBody();
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('provider')).toBe('local');
    expect(h.sendMessage).toHaveBeenCalledWith('你好呀', true);
  });

  it('T6: 未设置 sttProvider → 不携带 provider 字段（主窗口行为不变）', async () => {
    setUA('Mozilla/5.0 AppleWebKit Electron/33');
    h.stopRecording.mockResolvedValue(new Blob(['audio-bytes'], { type: 'audio/webm' }));

    await act(async () => root.render(<Harness />));
    await act(async () => { latest!.startRecording(); });
    await act(async () => { latest!.stopRecording(); });
    await vi.waitFor(() => expect(h.sendMessage).toHaveBeenCalled());

    expect(lastFetchBody().get('provider')).toBeNull();
  });

  it('T2 加固: 未成功开始录音时 stopRecording 为 no-op（防幻影语音消息）', async () => {
    setUA('Mozilla/5.0 AppleWebKit Electron/33');

    await act(async () => root.render(<Harness />));
    await act(async () => { latest!.stopRecording(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(h.stopRecording).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});
