/**
 * WorkBuddy（CodeBuddy）网关对话适配器
 *
 * WorkBuddy 是 Electron 桌面应用，没有对话 CLI，但它自带一个本地 HTTP 网关
 * （"CodeBuddy Remote Control"，默认端口从 WorkBuddy 运行时生成）：
 * - POST /api/v1/runs              → 启动一次 Agent run，返回 runId
 * - GET  /api/v1/runs/:runId/stream → SSE 流式返回结果
 *
 * 网关要求认证（AUTH_REQUIRED）。token 通过环境变量配置：
 *   WORKBUDDY_GATEWAY_URL   （默认 http://127.0.0.1:57956）
 *   WORKBUDDY_GATEWAY_TOKEN （Bearer token，WorkBuddy 网关开启远程控制后提供）
 *
 * 请求/响应字段按网关公开文档推断，兼容常见变体（runId/id/run.id，
 * 事件 text/delta/message/result/done）。
 */
import type { AgentChatAdapter } from './agentAdapters.js';

const DEFAULT_URL = process.env.WORKBUDDY_GATEWAY_URL || 'http://127.0.0.1:57956';
const DEFAULT_TOKEN = process.env.WORKBUDDY_GATEWAY_TOKEN || '';

/** 探测网关是否在线（401 也算在线：只是缺 token） */
export async function probeWorkbuddyGateway(
  baseUrl = DEFAULT_URL,
  token = DEFAULT_TOKEN,
): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/v1/health`, {
      signal: ctrl.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    clearTimeout(timer);
    return res.status !== 404;
  } catch {
    return false;
  }
}

function authMessage(): string {
  return 'WorkBuddy 网关需要认证：请在 WorkBuddy 中开启远程控制/网关并取得 token，'
    + '然后写入环境变量 WORKBUDDY_GATEWAY_TOKEN（服务器 .env），重启后即可对话。';
}

export class WorkBuddyGatewayAdapter implements AgentChatAdapter {
  constructor(
    private readonly baseUrl = DEFAULT_URL,
    private readonly token = DEFAULT_TOKEN,
  ) {}

  async run(task: string, opts: { cwd: string; signal?: AbortSignal }): Promise<string> {
    const base = this.baseUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    // 1. 启动 Agent run
    let runId: string;
    try {
      const res = await fetch(`${base}/api/v1/runs`, {
        method: 'POST',
        headers,
        // 网关通用消息格式：必填 id/type，任务内容放 text（2026-08-16 实测修正）
        body: JSON.stringify({ id: crypto.randomUUID(), type: 'message', text: task }),
        signal: opts.signal,
      });
      if (res.status === 401 || res.status === 403) return authMessage();
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return `WorkBuddy 网关错误（HTTP ${res.status}）${text ? `: ${text.slice(0, 300)}` : ''}`;
      }
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      runId = String(
        (data as { data?: { runId?: unknown } })?.data?.runId   // 网关实际响应 {data:{runId}}
        ?? (data as Record<string, unknown>)?.runId
        ?? (data as Record<string, unknown>)?.id
        ?? (data as { run?: { id?: unknown } })?.run?.id
        ?? '',
      );
      if (!runId) return 'WorkBuddy 网关未返回 runId，无法接收回复';
    } catch (err) {
      if (opts.signal?.aborted) return '（已停止）';
      const msg = err instanceof Error ? err.message : String(err);
      return `WorkBuddy 网关不可达（${msg}）。请确认 WorkBuddy 已启动且网关端口正确（WORKBUDDY_GATEWAY_URL）。`;
    }

    // 2. 通过 SSE 流收集结果
    try {
      const res = await fetch(`${base}/api/v1/runs/${encodeURIComponent(runId)}/stream`, {
        headers,
        signal: opts.signal,
      });
      if (res.status === 401 || res.status === 403) return authMessage();
      if (!res.ok || !res.body) {
        return `WorkBuddy 网关流式接口错误（HTTP ${res.status}）`;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let output = '';
      const deadline = Date.now() + 8 * 60 * 1000;

      const push = (raw: string): void => {
        const line = raw.trim();
        if (!line || line.startsWith(':')) return;
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (!payload) return;
          let parsed: Record<string, unknown> | null = null;
          try {
            parsed = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            // 非 JSON 的 data 行按纯文本追加
            output += payload;
            return;
          }
          const rawContent = parsed?.content;
          // 网关回复事件：content 为对象 {markdown/type/text}（2026-08-16 实测）
          let text: unknown = parsed?.text ?? parsed?.delta ?? parsed?.message;
          if (typeof rawContent === 'object' && rawContent !== null) {
            const c = rawContent as Record<string, unknown>;
            text = c.markdown ?? c.text ?? c.type ?? '';
          } else if (typeof rawContent === 'string') {
            text = rawContent;
          }
          if (typeof text === 'string' && text) output += text;
          if (parsed?.done === true || parsed?.type === 'done' || parsed?.type === 'result'
            || parsed?.status === 'completed') {
            if (typeof parsed?.result === 'string' && parsed.result) output += parsed.result;
          }
        }
      };

      while (true) {
        if (Date.now() > deadline) return output.trim() || '（WorkBuddy 响应超时）';
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) push(line);
      }
      if (buffer.trim()) push(buffer);
      return output.trim() || '（WorkBuddy 未返回内容）';
    } catch (err) {
      if (opts.signal?.aborted) return '（已停止）';
      const msg = err instanceof Error ? err.message : String(err);
      return `WorkBuddy 回复中断（${msg}）`;
    }
  }
}
