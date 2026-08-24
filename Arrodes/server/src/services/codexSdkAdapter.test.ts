import { describe, it, expect, vi, afterEach } from 'vitest';
import { CodexSdkAdapter } from './codexSdkAdapter.js';
import type { ThreadOptions } from '@openai/codex-sdk';

interface FakeTurn {
  items: unknown[];
  finalResponse: string;
  usage: null;
}

interface FakeThread {
  id: string | null;
  startOptions?: ThreadOptions;
  runs: Array<{ input: unknown; turnOptions?: { signal?: AbortSignal } }>;
  run: (input: unknown, turnOptions?: { signal?: AbortSignal }) => Promise<FakeTurn>;
}

interface FakeCodex {
  threads: Array<{ thread: FakeThread; options: ThreadOptions }>;
  startThread: (options: ThreadOptions) => FakeThread;
}

/**
 * 可控 fake：
 * - gate：非空时每个回合先 await gate（用于串行测试手动释放）
 * - hold：非空时回合挂起直到 signal abort（用于超时测试）
 */
function makeFakeCodex(opts: { gate?: Promise<void>; hold?: boolean } = {}): FakeCodex {
  const threads: FakeCodex['threads'] = [];
  const startThread: FakeCodex['startThread'] = (options: ThreadOptions) => {
    const thread: FakeThread = {
      id: `thread-${threads.length + 1}`,
      startOptions: options,
      runs: [],
      run: async (input, turnOptions) => {
        thread.runs.push({ input, turnOptions });
        const sig = turnOptions?.signal;
        if (sig?.aborted) throw new Error('AbortError');
        if (opts.hold) {
          await new Promise<void>((_resolve, reject) => {
            sig?.addEventListener('abort', () => reject(new Error('AbortError')), { once: true });
          });
        }
        if (opts.gate) await opts.gate;
        return { items: [], finalResponse: 'ok', usage: null };
      },
    };
    threads.push({ thread, options });
    return thread;
  };
  return { threads, startThread };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('CodexSdkAdapter（codex-sdk 集成）', () => {
  it('同一 sessionKey 复用同一 Thread，不同 sessionKey 隔离', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({ codex: fake as never });

    await adapter.run('你好', { cwd: 'E:/x', sessionKey: 'ws1:codex' });
    await adapter.run('接着聊', { cwd: 'E:/x', sessionKey: 'ws1:codex' });
    await adapter.run('另一个工作区', { cwd: 'E:/y', sessionKey: 'ws2:codex' });

    expect(fake.threads).toHaveLength(2);
    expect(fake.threads[0].thread.runs).toHaveLength(2);
    expect(fake.threads[1].thread.runs).toHaveLength(1);
  });

  it('无 sessionKey 时每次调用新建一次性 Thread', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({ codex: fake as never });

    await adapter.run('任务A', { cwd: 'E:/x' });
    await adapter.run('任务B', { cwd: 'E:/x' });

    expect(fake.threads).toHaveLength(2);
  });

  it('权限映射：default→workspace-write、full→danger-full-access，且透传工作目录/跳过 git 检查/never 审批', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({ codex: fake as never });

    await adapter.run('默认权限', { cwd: 'E:/proj', sessionKey: 'a', permission: 'default' });
    await adapter.run('全部权限', { cwd: 'E:/proj', sessionKey: 'b', permission: 'full' });

    const t0 = fake.threads[0]!;
    const t1 = fake.threads[1]!;
    expect(t0.options.sandboxMode).toBe('workspace-write');
    expect(t1.options.sandboxMode).toBe('danger-full-access');
    for (const t of fake.threads) {
      expect(t.options.workingDirectory).toBe('E:/proj');
      expect(t.options.skipGitRepoCheck).toBe(true);
      expect(t.options.approvalPolicy).toBe('never');
      expect(t.options.threadSource).toBe('arrodes');
    }
  });

  it('未传权限时按 default 处理', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({ codex: fake as never });
    await adapter.run('hi', { cwd: 'E:/x', sessionKey: 'a' });
    expect(fake.threads[0].options.sandboxMode).toBe('workspace-write');
  });

  it('调用方 signal 中止时透传到回合并报告「被中止」', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({ codex: fake as never });
    const ac = new AbortController();
    ac.abort();

    const reply = await adapter.run('长任务', { cwd: 'E:/x', sessionKey: 'k', signal: ac.signal });

    const t0 = fake.threads[0]!;
    expect(t0.thread.runs[0]?.turnOptions?.signal).toBeDefined();
    expect(reply).toContain('中止');
  });

  it('超时到期中止回合并报告「超时」', async () => {
    vi.useFakeTimers();
    const fake = makeFakeCodex({ hold: true });
    const adapter = new CodexSdkAdapter({ codex: fake as never, timeoutMs: 1000 });

    const promise = adapter.run('卡住的任务', { cwd: 'E:/x', sessionKey: 'k' });
    await vi.advanceTimersByTimeAsync(1001);
    const reply = await promise;

    expect(reply).toContain('超时');
  });

  it('同一 sessionKey 并发调用串行执行', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({ codex: fake as never });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fake.startThread = (options: ThreadOptions) => {
      const thread: FakeThread = {
        id: 'serial',
        startOptions: options,
        runs: [],
        run: async (input, turnOptions) => {
          thread.runs.push({ input, turnOptions });
          await gate;
          return { items: [], finalResponse: 'ok', usage: null };
        },
      };
      fake.threads.push({ thread, options });
      return thread;
    };

    const p1 = adapter.run('第一轮', { cwd: 'E:/x', sessionKey: 'k' });
    const p2 = adapter.run('第二轮', { cwd: 'E:/x', sessionKey: 'k' });

    // 第一轮尚未结束前，第二轮不应开始新的回合
    await Promise.resolve();
    expect(fake.threads[0].thread.runs).toHaveLength(1);
    release();
    await Promise.all([p1, p2]);
    expect(fake.threads[0].thread.runs).toHaveLength(2);
  });

  it('回合失败时返回错误信息并丢弃该线程（下轮重建）', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({ codex: fake as never });

    await adapter.run('正常回合', { cwd: 'E:/x', sessionKey: 'k' });
    const failing = fake.threads[0].thread;
    failing.run = async () => {
      throw new Error('session corrupted');
    };

    const reply = await adapter.run('boom', { cwd: 'E:/x', sessionKey: 'k' });
    expect(reply).toContain('session corrupted');

    // 下轮重建新线程
    await adapter.run('recover', { cwd: 'E:/x', sessionKey: 'k' });
    expect(fake.threads).toHaveLength(2);
  });

  it('spawn ENOENT 时回退 CLI 适配器并记录警告', async () => {
    const fake = makeFakeCodex();
    let warned = '';
    const warn = vi.spyOn(console, 'warn').mockImplementation((m: unknown) => {
      warned = String(m);
    });
    fake.threads = [];
    fake.startThread = (options: ThreadOptions) => {
      const thread: FakeThread = {
        id: 't',
        startOptions: options,
        runs: [],
        run: async () => {
          throw Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' });
        },
      };
      fake.threads.push({ thread, options });
      return thread;
    };
    const cliFallback = {
      run: async (task: string, opts: { cwd: string }) => `cli 回退回复:${task}:${opts.cwd}`,
    };
    const adapter = new CodexSdkAdapter({ codex: fake as never, cliFallback: cliFallback as never });

    const reply = await adapter.run('hi', { cwd: 'E:/x', sessionKey: 'k' });

    expect(reply).toBe('cli 回退回复:hi:E:/x');
    expect(warned).toContain('回退');
    warn.mockRestore();
  });

  it('环境变量可配置模型与推理档', async () => {
    const fake = makeFakeCodex();
    const adapter = new CodexSdkAdapter({
      codex: fake as never,
      env: { ARRODES_CODEX_MODEL: 'gpt-5.3-codex', ARRODES_CODEX_REASONING: 'high' },
    });
    await adapter.run('hi', { cwd: 'E:/x', sessionKey: 'a' });
    expect(fake.threads[0].options.model).toBe('gpt-5.3-codex');
    expect(fake.threads[0].options.modelReasoningEffort).toBe('high');
  });
});
