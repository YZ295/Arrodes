import { randomUUID } from 'node:crypto';

export type Risk = 'low' | 'high';

export interface ActionOwner {
  localUserId: string;
  workspaceId: string;
  sessionId: string;
}

const SYSTEM_ACTION_OWNER: ActionOwner = {
  localUserId: 'system',
  workspaceId: 'system',
  sessionId: 'system',
};

export interface PendingAction {
  id: string;
  skill: string;
  args: Record<string, unknown>;
  description: string;
  risk: Risk;
  createdAt: number;
  owner: ActionOwner;
  /** 确认后的直通执行器（绕过技能内门禁，避免二次排队） */
  executor?: (args: Record<string, unknown>) => Promise<string>;
}

export interface ActionRequestOutcome {
  risk: Risk;
  pending: PendingAction | null;
}

export const DEFAULT_RISK: Risk = 'high';

export const ACTION_INTENTS: Record<string, string> = {
  open_app: 'desktop.application.open', open_url: 'desktop.url.open',
  web_search_direct: 'web.search', web_search: 'web.search',
  list_windows: 'desktop.window.inspect', focus_window: 'desktop.window.focus',
  get_foreground: 'desktop.window.inspect', system_stats: 'system.inspect',
  volume_control: 'desktop.media.control', media_control: 'desktop.media.control',
  clipboard_get: 'clipboard.read', screenshot: 'screen.capture',
  type_text: 'desktop.input.write', send_hotkey: 'desktop.input.write',
  clipboard_set: 'clipboard.write', close_window: 'desktop.window.close',
  lock_screen: 'system.session.lock', mcp_list_tools: 'mcp.inspect',
  mcp_call_tool: 'mcp.execute', exec_command: 'system.command.execute',
  write_file: 'filesystem.write', read_file: 'filesystem.read',
  minimax_tts: 'speech.synthesize', list_directory: 'filesystem.read',
  get_file_info: 'filesystem.read', create_file: 'filesystem.create',
  delete_file: 'filesystem.delete', move_file: 'filesystem.move',
  copy_file: 'filesystem.copy',
};

export const INTENT_RISK_RULES: Record<string, Risk> = {
  'desktop.application.open': 'low', 'desktop.url.open': 'low', 'web.search': 'low',
  'desktop.window.inspect': 'low', 'desktop.window.focus': 'low', 'system.inspect': 'low',
  'desktop.media.control': 'low', 'clipboard.read': 'low', 'screen.capture': 'low',
  'mcp.inspect': 'low', 'filesystem.read': 'low', 'speech.synthesize': 'low',
  'desktop.input.write': 'high', 'clipboard.write': 'high', 'desktop.window.close': 'high',
  'system.session.lock': 'high', 'mcp.execute': 'high', 'system.command.execute': 'high',
  'filesystem.write': 'high', 'filesystem.create': 'high', 'filesystem.delete': 'high',
  'filesystem.move': 'high', 'filesystem.copy': 'high',
};

export function intentForAction(action: string): string {
  return ACTION_INTENTS[action] ?? `action.${action}`;
}

export function classifyIntent(intent: string): Risk {
  return INTENT_RISK_RULES[intent] ?? DEFAULT_RISK;
}

export const RISK_RULES: Record<string, Risk> = Object.fromEntries(
  Object.entries(ACTION_INTENTS).map(([action, intent]) => [action, classifyIntent(intent)]),
);

export function classifyAction(skill: string): Risk {
  return classifyIntent(intentForAction(skill));
}

export class ActionGate {
  private pending = new Map<string, PendingAction>();
  private ttlMs: number;
  private maxPending: number;
  private now: () => number;

  constructor(opts: { ttlMs?: number; maxPending?: number; now?: () => number } = {}) {
    this.ttlMs = opts.ttlMs ?? 5 * 60 * 1000;
    this.maxPending = opts.maxPending ?? 20;
    this.now = opts.now ?? (() => Date.now());
  }

  request(
    skill: string,
    args: Record<string, unknown>,
    description: string,
    executor?: (args: Record<string, unknown>) => Promise<string>,
    owner: ActionOwner = SYSTEM_ACTION_OWNER,
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
      owner,
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

  getForOwner(id: string, owner: ActionOwner): PendingAction | undefined {
    const item = this.get(id);
    return item && sameOwner(item.owner, owner) ? item : undefined;
  }

  getLatestForOwner(owner: ActionOwner): PendingAction | null {
    this.prune();
    let latest: PendingAction | null = null;
    for (const item of this.pending.values()) {
      if (sameOwner(item.owner, owner) && (!latest || item.createdAt >= latest.createdAt)) latest = item;
    }
    return latest;
  }

  list(): PendingAction[] {
    this.prune();
    return Array.from(this.pending.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  listForOwner(owner: ActionOwner): PendingAction[] {
    return this.list().filter((item) => sameOwner(item.owner, owner));
  }

  confirm(id: string): PendingAction | undefined {
    this.prune();
    const item = this.pending.get(id);
    if (item) this.pending.delete(id);
    return item;
  }

  confirmForOwner(id: string, owner: ActionOwner): PendingAction | undefined {
    const item = this.getForOwner(id, owner);
    return item ? this.confirm(item.id) : undefined;
  }

  deny(id: string): PendingAction | undefined {
    return this.confirm(id);
  }

  denyForOwner(id: string, owner: ActionOwner): PendingAction | undefined {
    return this.confirmForOwner(id, owner);
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [id, item] of this.pending) {
      if (item.createdAt < cutoff) this.pending.delete(id);
    }
  }
}

function sameOwner(a: ActionOwner, b: ActionOwner): boolean {
  return a.localUserId === b.localUserId
    && a.workspaceId === b.workspaceId
    && a.sessionId === b.sessionId;
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
