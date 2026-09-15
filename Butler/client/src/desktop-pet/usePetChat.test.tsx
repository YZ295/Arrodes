// @vitest-environment jsdom
// T1 回归锁定：桌宠对话链路（会话复用 / 新建会话 / 文本 happy path / 防御分支）
// 链路：usePetChat → MessageChannel(ws) → 主 agent → useTTS 播报
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePetChat, type PetChatController } from './usePetChat';

const h = vi.hoisted(() => {
  const sent: Array<{ type: string; sessionId?: string; content?: string; requestId?: string; isVoice?: boolean }> = [];
  const subscribers = new Map<string, Record<string, (data?: unknown) => void>>();
  return {
    sent,
    subscribers,
    speak: vi.fn(),
    ttsStop: vi.fn(),
    ttsSpeaking: { current: false },
    recStart: vi.fn(),
    recStop: vi.fn(),
    recAbort: vi.fn(),
    vadStart: vi.fn(),
    vadStop: vi.fn(),
    isRunning: { current: true },
    vadConfig: { current: null as null | { onSpeechStart?: () => void; onSpeechEnd?: () => void } },
    channel: {
      connect: vi.fn(),
      isConnected: vi.fn(() => true),
      nextRequestId: vi.fn(() => 'req-1'),
      subscribe: (requestId: string, cbs: Record<string, (data?: unknown) => void>) => {
        subscribers.set(requestId, cbs);
        return () => subscribers.delete(requestId);
      },
      send: (msg: { type: string; sessionId?: string; content?: string; requestId?: string; isVoice?: boolean }) => {
        sent.push(msg);
      },
    },
  };
});

vi.mock('../core/MessageChannel', () => ({
  MessageChannel: { getInstance: () => h.channel },
}));

vi.mock('../voice/hooks/useTTS', () => ({
  useTTS: () => ({ speak: h.speak, stop: h.ttsStop, isSpeaking: h.ttsSpeaking.current }),
}));

vi.mock('../voice/hooks/useVoiceRecorder', () => ({
  useVoiceRecorder: () => ({
    isRecording: false, recordingDuration: 0, recordingVolume: 0, interimText: '', error: null,
    startRecording: h.recStart, stopRecording: h.recStop, abortRecording: h.recAbort,
  }),
}));

vi.mock('../modules/voice/useVAD', () => ({
  useVAD: (config: { onSpeechStart?: () => void; onSpeechEnd?: () => void }) => {
    h.vadConfig.current = config;
    return { isSpeaking: false, level: 0, start: h.vadStart, stop: h.vadStop, isRunning: h.isRunning.current };
  },
}));

let fetchMock: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let latest: PetChatController | null = null;

function Harness({ enabled = true, speaking = false }: { enabled?: boolean; speaking?: boolean }) {
  h.ttsSpeaking.current = speaking;
  latest = usePetChat(enabled);
  return null;
}

const flush = () => act(async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  h.sent.length = 0;
  h.subscribers.clear();
  h.speak.mockClear();
  h.ttsSpeaking.current = false;
  h.recStart.mockClear();
  h.recStop.mockClear();
  h.recAbort.mockClear();
  h.vadStart.mockClear();
  h.vadStop.mockClear();
  h.isRunning.current = true;
  h.vadConfig.current = null;
  h.channel.connect.mockClear();
  h.channel.isConnected.mockClear();
  h.channel.nextRequestId.mockClear().mockReturnValue('req-1');
  h.channel.isConnected.mockImplementation(() => true);
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === '/api/v1/sessions' && init?.method === 'POST') {
      return { ok: true, json: async () => ({ id: 's-new' }) } as Response;
    }
    if (/^\/api\/v1\/sessions\/.+/.test(url)) {
      return { ok: true, json: async () => ({ id: 's-existing' }) } as Response;
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

describe('usePetChat（T1 回归锁定）', () => {
  it('已有会话 id 时复用（GET 校验通过，不新建）', async () => {
    localStorage.setItem('arrodes_desktop_pet_session', 's-existing');
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('在吗'));
    let done: Promise<void> = Promise.resolve();
    await act(async () => { done = latest!.sendDraft(); });
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions/s-existing');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/v1/sessions', expect.anything());
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].sessionId).toBe('s-existing');
    await act(async () => {
      h.subscribers.get('req-1')!.onComplete!({ content: '在的' });
      await done;
    });
  });

  it('无会话 id 时新建会话并用其发送', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('你好'));
    let done: Promise<void> = Promise.resolve();
    await act(async () => { done = latest!.sendDraft(); });
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/sessions', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('arrodes_desktop_pet_session')).toBe('s-new');
    expect(h.sent[0].sessionId).toBe('s-new');
    await act(async () => {
      h.subscribers.get('req-1')!.onComplete!({ content: '你好，主人' });
      await done;
    });
  });

  it('文本对话 happy path：chunk 追加、complete 收敛、TTS 播报', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('讲个笑话'));
    let done: Promise<void> = Promise.resolve();
    await act(async () => { done = latest!.sendDraft(); });
    await flush();
    expect(latest!.thinking).toBe(true);
    expect(h.sent[0]).toMatchObject({ type: 'message', content: '讲个笑话', isVoice: false, requestId: 'req-1' });

    await act(async () => {
      const cbs = h.subscribers.get('req-1')!;
      cbs.onChunk!({ content: '第一' });
      cbs.onChunk!({ content: '第二' });
      cbs.onComplete!({ content: '第一第二' });
      await done;
    });
    const petMessage = latest!.messages.find((m) => m.id === 'req-1');
    expect(petMessage?.content).toBe('第一第二');
    expect(latest!.thinking).toBe(false);
    expect(h.speak).toHaveBeenCalledTimes(1);
    expect(h.speak).toHaveBeenCalledWith('第一第二');
  });

  it('空草稿不发送', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('   '));
    await act(async () => { await latest!.sendDraft(); });
    expect(h.sent).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('连接未就绪时给出明确错误', async () => {
    h.channel.isConnected.mockImplementation(() => false);
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('你好'));
    await act(async () => { await latest!.sendDraft(); });
    expect(latest!.error).toBe('对话连接尚未就绪，请稍后重试');
    expect(h.sent).toHaveLength(0);
  });

  it('ws 错误回调透出为对话错误', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('你好'));
    let done: Promise<void> = Promise.resolve();
    await act(async () => { done = latest!.sendDraft(); });
    await flush();
    await act(async () => {
      h.subscribers.get('req-1')!.onError!();
      await done.catch(() => {});
    });
    expect(latest!.error).toBe('对话服务返回错误');
    expect(h.speak).not.toHaveBeenCalled();
  });

  it('T2: 免提默认开启，VAD 自动启动', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    expect(latest!.handsFree).toBe(true);
    expect(h.vadStart).toHaveBeenCalled();
  });

  it('T2: VAD speechStart/speechEnd 驱动录音器启停', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => { h.vadConfig.current!.onSpeechStart!(); });
    expect(h.recStart).toHaveBeenCalledTimes(1);
    await act(async () => { h.vadConfig.current!.onSpeechEnd!(); });
    expect(h.recStop).toHaveBeenCalledTimes(1);
  });

  it('T2: thinking 期间 speechStart 不触发录音（防自抢话）', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('你好'));
    let done: Promise<void> = Promise.resolve();
    await act(async () => { done = latest!.sendDraft(); });
    await flush();
    expect(latest!.thinking).toBe(true);
    await act(async () => { h.vadConfig.current!.onSpeechStart!(); });
    expect(h.recStart).not.toHaveBeenCalled();
    await act(async () => {
      h.subscribers.get('req-1')!.onComplete!({ content: '答' });
      await done;
    });
  });

  it('T2: 免提关闭 → VAD 停止并持久化偏好', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setHandsFree(false));
    expect(h.vadStop).toHaveBeenCalled();
    expect(localStorage.getItem('arrodes_pet_handsfree')).toBe('0');
    expect(latest!.handsFree).toBe(false);
  });

  it('T3: TTS 播报开始 → VAD 挂起；进行中的录音被丢弃（不提交）', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => { h.vadConfig.current!.onSpeechStart!(); });
    expect(h.recStart).toHaveBeenCalledTimes(1);

    await act(async () => root.render(<Harness speaking />));
    expect(h.vadStop).toHaveBeenCalled();
    expect(h.recAbort).toHaveBeenCalledTimes(1);
    expect(h.recStop).not.toHaveBeenCalled();
  });

  it('T3: 播报结束 → VAD 恢复监听', async () => {
    await act(async () => root.render(<Harness speaking />));
    await flush();
    expect(h.vadStart).not.toHaveBeenCalled();
    await act(async () => root.render(<Harness />));
    await flush();
    expect(h.vadStart).toHaveBeenCalled();
  });

  it('T4: speaking 状态透出（球体点击分支依据）', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    expect(latest!.speaking).toBe(false);
    await act(async () => root.render(<Harness speaking />));
    expect(latest!.speaking).toBe(true);
  });

  it('T4: 单击静音切换 → VAD 挂起/恢复（不持久化，安全开关）', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.toggleMicMuted());
    expect(latest!.micMuted).toBe(true);
    expect(h.vadStop).toHaveBeenCalled();
    await act(async () => latest!.toggleMicMuted());
    expect(latest!.micMuted).toBe(false);
    expect(h.vadStart).toHaveBeenCalledTimes(2);
  });

  it('T4: micMuted 挂起时进行中的录音被丢弃', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => { h.vadConfig.current!.onSpeechStart!(); });
    await act(async () => latest!.toggleMicMuted());
    expect(h.recAbort).toHaveBeenCalledTimes(1);
  });

  it('T4: interrupt → 停止播报、保留部分内容、thinking 归位、不报错', async () => {
    await act(async () => root.render(<Harness />));
    await flush();
    await act(async () => latest!.setDraft('讲个长故事'));
    let done: Promise<void> = Promise.resolve();
    await act(async () => { done = latest!.sendDraft(); });
    await flush();
    await act(async () => {
      h.subscribers.get('req-1')!.onChunk!({ content: '开头部分' });
    });
    await act(async () => latest!.interrupt());
    await act(async () => { await done; });
    expect(h.ttsStop).toHaveBeenCalled();
    expect(latest!.thinking).toBe(false);
    expect(latest!.error).toBeNull();
    expect(h.speak).not.toHaveBeenCalled();
    expect(latest!.messages.find((m) => m.id === 'req-1')?.content).toBe('开头部分');
  });
});
