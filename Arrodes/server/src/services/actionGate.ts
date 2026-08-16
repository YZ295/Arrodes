import { randomUUID } from 'node:crypto';

export type Risk = 'low' | 'high';

export interface PendingAction {
  id: string;
  skill: string;
  args: Record<string, unknown>;
  description: string;
  risk: Risk;
  createdAt: number;
  /** 确认后的直通执行器（绕过技能内门禁，避免二次排队） */
  executor?: (args: Record<string, unknown>) => Promise<string>;
}

export interface ActionRequestOutcome {
  risk: Risk;
  pending: PendingAction | null;
}

export const DEFAULT_RISK: Risk = 'high';

export const RISK_RULES: Record<string, Risk> = {
  open_app: 'low',
  open_url: 'low',
  web_search_direct: 'low',
  web_search: 'low',
  list_windows: 'low',
  focus_window: 'low',
  get_foreground: 'low',
  system_stats: 'low',
  volume_control: 'low',
  media_control: 'low',
  clipboard_get: 'low',
  screenshot: 'low',
  type_text: 'high',
  send_hotkey: 'high',
  clipboard_set: 'high',
  close_window: 'high',
  lock_screen: 'high',
  mcp_list_tools: 'low',
  mcp_call_tool: 'high',
  exec_command: 'high',
  write_file: 'high',
  read_file: 'low',
  minimax_tts: 'low',
  list_directory: 'low',
  get_file_info: 'low',
  create_file: 'high',
  delete_file: 'high',
  move_file: 'high',
  copy_file: 'high',
};

export function classifyAction(skill: string): Risk {
  return RISK_RULES[skill] ?? DEFAULT_RISK;
}

export class ActionGate {
  private pending = new Map<string, PendingAction>();
  private ttlMs: number;
  private maxPending: number;
  private now: () => number;
  private autoApprove = false;

  constructor(opts: { ttlMs?: number; maxPending?: number; now?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.maxPending = opts.maxPending ?? 20;
    this.now = opts.now ?? (() => Date.now());
  }

  /** 全部权限：高风险操作自动放行（不生成待确认项） */
  setAutoApprove(v: boolean): void {
    this.autoApprove = v;
  }

  isAutoApprove(): boolean {
    return this.autoApprove;
  }

  request(
    skill: string,
    args: Record<string, unknown>,
    description: string,
    executor?: (args: Record<string, unknown>) => Promise<string>,
  ): ActionRequestOutcome {
    this.prune();
    const risk = classifyAction(skill);
    if (risk === 'low') return { risk, pending: null };
    if (this.pending.size >= this.maxPending) {
      throw new Error(`待确认队列已满（${this.maxPending}），请先处理旧请求`);
    }
    const item: PendingAction = {
      id: randomUUID(),
      skill,
      args,
      description,
      risk,
      createdAt: this.now(),
      ...(executor ? { executor } : {}),
    };
    this.pending.set(item.id, item);
    return { risk, pending: item };
  }

  get(id: string): PendingAction | undefined {
    this.prune();
    return this.pending.get(id);
  }

  getLatest(): PendingAction | null {
    this.prune();
    let latest: PendingAction | null = null;
    for (const item of this.pending.values()) {
      // 同时间戳时取后插入者（>=），保证"最近请求"语义
      if (!latest || item.createdAt >= latest.createdAt) latest = item;
    }
    return latest;
  }

  list(): PendingAction[] {
    this.prune();
    return Array.from(this.pending.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  confirm(id: string): PendingAction | undefined {
    this.prune();
    const item = this.pending.get(id);
    if (item) this.pending.delete(id);
    return item;
  }

  deny(id: string): PendingAction | undefined {
    return this.confirm(id);
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, item] of this.pending) {
      if (item.createdAt < cutoff) this.pending.delete(id);
    }
  }
}

export const actionGate = new ActionGate();

export type ConfirmIntent = 'confirm' | 'deny';

const CONFIRM_RE = /^(确认|同意|批准|确认执行|同意执行|可以执行|好的|可以|行|嗯|yes|ok|y|执行)$/i;
const DENY_RE = /^(取消|拒绝|不要|算了|不行|不|no|n)$/i;

export function matchConfirmIntent(text: string): ConfirmIntent | null {
  const t = text.trim();
  if (!t || t.length > 30) return null;
  if (CONFIRM_RE.test(t)) return 'confirm';
  if (DENY_RE.test(t)) return 'deny';
  return null;
}
