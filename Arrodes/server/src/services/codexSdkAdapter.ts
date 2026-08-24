/**
 * CodexSdkAdapter：用 @openai/codex-sdk 替换 CLI 底层通道（codex-sdk 变更核心）
 *
 * - 有状态：同一 sessionKey 复用同一 codex Thread（连续对话），无 sessionKey
 *   走一次性会话；
 * - 权限映射：default→workspace-write、full→danger-full-access；
 * - 中止：把调用方 signal 与回合超时合并为 AbortSignal 直达 Thread.run；
 * - 串行：同一 sessionKey 的并发调用排队等待前一轮结束；
 * - 回退：SDK 二进制缺失（spawn ENOENT）时回退 CodexCliAdapter 并告警。
 */
import { Codex, type SandboxMode, type Thread, type ThreadOptions } from '@openai/codex-sdk';
import type { AgentChatAdapter, AgentRunOptions } from './agentAdapterTypes.js';

const DEFAULT_TIMEOUT_MS = 480_000; // 8 分钟，与既有 CLI 适配器一致
const DEFAULT_MAX_THREADS = 64;
const VALID_REASONING = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

export interface CodexSdkAdapterOptions {
  /** 环境变量（测试注入；缺省 process.env） */
  env?: NodeJS.ProcessEnv;
  /** Codex 客户端（测试注入 fake；缺省 new Codex()） */
  codex?: Codex;
  /** CLI 回退适配器（测试注入；缺省懒加载 CodexCliAdapter） */
  cliFallback?: AgentChatAdapter;
  /** 回合超时毫秒（缺省读 env 或 8 分钟） */
  timeoutMs?: number;
  /** 线程缓存上限（缺省读 env 或 64） */
  maxThreads?: number;
}

function mapPermission(permission?: AgentRunOptions['permission']): SandboxMode {
  return permission === 'full' ? 'danger-full-access' : 'workspace-write';
}

function isSpawnMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  const msg = err instanceof Error ? err.message : String(err);
  return code === 'ENOENT' || /ENOENT|spawn .* not found|无法找到/i.test(msg);
}

export class CodexSdkAdapter implements AgentChatAdapter {
  readonly stateful = true;

  private readonly codex: Codex;
  private readonly threads = new Map<string, Thread>();
  private readonly inflight = new Map<string, Promise<string>>();
  private readonly timeoutMs: number;
  private readonly maxThreads: number;
  private readonly model?: string;
  private readonly reasoningEffort?: ThreadOptions['modelReasoningEffort'];
  private cliFallback?: AgentChatAdapter;
  private oneShotCounter = 0;

  constructor(opts: CodexSdkAdapterOptions = {}) {
    const env = opts.env ?? process.env;
    this.codex = opts.codex ?? new Codex();
    this.cliFallback = opts.cliFallback;
    this.timeoutMs = opts.timeoutMs ?? Number(env.ARRODES_CODEX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    this.maxThreads = opts.maxThreads ?? Number(env.ARRODES_CODEX_MAX_THREADS || DEFAULT_MAX_THREADS);
    this.model = env.ARRODES_CODEX_MODEL || undefined;
    const reasoning = env.ARRODES_CODEX_REASONING;
    this.reasoningEffort =
      reasoning && VALID_REASONING.has(reasoning)
        ? (reasoning as ThreadOptions['modelReasoningEffort'])
        : undefined;
  }

  async run(task: string, opts: AgentRunOptions): Promise<string> {
    const key = opts.sessionKey ?? `one-shot:${++this.oneShotCounter}`;
    // 同 key 并发串行：链接到上一轮 promise 之后
    const prev = this.inflight.get(key);
    const next = prev
      ? prev.then(() => this.executeTurn(key, task, opts))
      : this.executeTurn(key, task, opts);
    this.inflight.set(key, next);
    try {
      return await next;
    } finally {
      if (this.inflight.get(key) === next) this.inflight.delete(key);
    }
  }

  private async executeTurn(key: string, task: string, opts: AgentRunOptions): Promise<string> {
    let thread = this.threads.get(key);
    if (!thread) {
      if (this.threads.size >= this.maxThreads) {
        const oldest = this.threads.keys().next().value as string | undefined;
        if (oldest) this.threads.delete(oldest);
      }
      thread = this.codex.startThread({
        workingDirectory: opts.cwd,
        skipGitRepoCheck: true,
        sandboxMode: mapPermission(opts.permission),
        approvalPolicy: 'never',
        threadSource: 'arrodes',
        model: this.model,
        modelReasoningEffort: this.reasoningEffort,
      });
      this.threads.set(key, thread);
    }

    const controller = new AbortController();
    const onCallerAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onCallerAbort, { once: true });
    if (opts.signal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    timer.unref?.();

    try {
      const turn = await thread.run(task, { signal: controller.signal });
      const final = (turn.finalResponse || '').trim();
      return final || 'codex 无输出';
    } catch (err) {
      if (opts.signal?.aborted) return 'codex 执行被中止（用户取消）';
      if (timedOut) {
        this.threads.delete(key);
        return `codex 执行超时（超过 ${Math.round(this.timeoutMs / 60000)} 分钟上限）`;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.threads.delete(key); // 线程异常：丢弃，下轮重建
      if (isSpawnMissing(err)) return this.fallback(task, opts);
      return `codex 执行失败: ${msg}`;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private async fallback(task: string, opts: AgentRunOptions): Promise<string> {
    console.warn('[CodexSdk] codex SDK 二进制不可用，本回合回退 CLI 适配器');
    if (!this.cliFallback) {
      const { CodexCliAdapter } = await import('./agentAdapters.js');
      this.cliFallback = new CodexCliAdapter();
    }
    return this.cliFallback.run(task, { cwd: opts.cwd, signal: opts.signal });
  }
}
