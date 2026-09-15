/**
 * 统一记忆入口（MemoryService）
 *
 * 架构定调：**阿罗德斯拥有全部记忆，其他模块只是记忆的使用者。**
 *
 * 三层归属（唯一权威，其余只能是缓存/索引/导出）：
 *   1. 运行状态      → SQLite（sessions / messages / tasks / reminders / 屏幕活动）
 *   2. 长期记忆      → Obsidian（人类可读、可改、可删的权威来源）
 *   3. 候选与索引    → SQLite workspace_memories（可整体重建，不产生 Obsidian 之外的新事实）
 *
 * 硬规则：
 *   - 所有模块（管家 / 控制台 / 技能 / 外部智能体）只能经本入口读写记忆
 *   - 外部智能体只能提交候选，由阿罗德斯统一审核后才进入长期记忆
 *   - 私人（scope=user）记忆默认不外发；上下文按「当前任务 / 当前项目 / 用户授权」边界组装
 *   - 屏幕观察、对话与执行日志默认只是证据，不是长期记忆
 */
import {
  workspaceMemoryHub,
  type WorkspaceMemory,
  type MemoryScope,
  type MemoryStatus,
  type WorkspaceMemoryType,
} from '../workspace/memory-hub.js';
import { defaultVaultPath, memoryDir, readMemoryNotes, syncWorkspaceMemoriesToObsidian } from './obsidianMemory.js';
import { MemoryRepository } from '../db/memory-repo.js';

/** 统一记忆结构（对外稳定契约） */
export interface MemoryRecord {
  id: string;
  content: string;
  type: WorkspaceMemoryType;
  scope: MemoryScope;
  projectId: string;
  source: string;
  evidence: string;
  confidence: number;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SubmitMemoryInput {
  content: string;
  /** 来源标识：user / arrodes / butler / console / codex / dsh / workbuddy / screen / skill ... */
  source: string;
  type?: WorkspaceMemoryType;
  scope?: MemoryScope;
  projectId?: string;
  workspaceId?: string;
  /** 证据：出处、屏幕时间点、原话片段 */
  evidence?: string;
  confidence?: number;
  /**
   * 是否免审核直接进入长期记忆。
   * 只允许「用户直接操作 / 阿罗德斯自身已确认」的场景传 true；
   * 外部智能体一律不得传 true（传了也会被降级为候选）。
   */
  autoConfirm?: boolean;
}

/** 允许免审核的来源（阿罗德斯自身与用户的直接操作） */
const TRUSTED_SOURCES = new Set(['user', 'arrodes', 'butler', 'console']);

function toRecord(m: WorkspaceMemory): MemoryRecord {
  return {
    id: m.id,
    content: m.content,
    type: m.type,
    scope: (m.scope ?? 'project') as MemoryScope,
    projectId: m.projectId ?? '',
    source: m.source || m.sourceAgent,
    evidence: m.evidence ?? '',
    confidence: m.confidence ?? 0.8,
    status: (m.status ?? 'confirmed') as MemoryStatus,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt || m.createdAt,
  };
}

/**
 * 提交一条记忆。外部来源一律入候选队列，等审核后才进长期记忆。
 */
export function submitMemory(input: SubmitMemoryInput): MemoryRecord {
  const source = input.source || 'arrodes';
  const mayAutoConfirm = input.autoConfirm === true && TRUSTED_SOURCES.has(source);
  const record = workspaceMemoryHub.add({
    content: input.content,
    type: input.type,
    sourceAgent: source,
    source,
    workspaceId: input.workspaceId,
    scope: input.scope,
    projectId: input.projectId,
    evidence: input.evidence,
    confidence: input.confidence,
    status: mayAutoConfirm ? 'confirmed' : 'candidate',
  });
  return toRecord(record);
}

/** 审核通过：候选 → 已确认（之后会随同步进入 Obsidian） */
export function confirmMemory(id: string): MemoryRecord | null {
  const updated = workspaceMemoryHub.setStatus(id, 'confirmed');
  return updated ? toRecord(updated) : null;
}

/** 审核拒绝：候选 → 已拒绝（保留痕迹，不再进入上下文与 Obsidian） */
export function rejectMemory(id: string): MemoryRecord | null {
  const updated = workspaceMemoryHub.setStatus(id, 'rejected');
  return updated ? toRecord(updated) : null;
}

/** 待审核候选队列 */
export function listPendingMemories(workspaceId = 'default'): MemoryRecord[] {
  return workspaceMemoryHub.listPending(workspaceId).map(toRecord);
}

/** 已确认的长期记忆 */
export function listConfirmedMemories(workspaceId = 'default'): MemoryRecord[] {
  return workspaceMemoryHub.listConfirmed(workspaceId).map(toRecord);
}

/**
 * 统一召回：只返回「已确认」的记忆。候选与已拒绝不参与召回。
 */
export function recallMemories(
  query: string,
  opts: { workspaceId?: string; limit?: number } = {},
): MemoryRecord[] {
  const limit = opts.limit ?? 20;
  return workspaceMemoryHub
    .searchConfirmed(query, limit, opts.workspaceId || 'default')
    .map(toRecord);
}

/**
 * 多关键词 OR 召回（只返回已确认）。主对话链路的取数口。
 */
export function recallByKeywords(
  keywords: string[],
  opts: { workspaceId?: string; limit?: number } = {},
): MemoryRecord[] {
  const limit = opts.limit ?? 20;
  return workspaceMemoryHub
    .searchConfirmedByKeywords(keywords, limit, opts.workspaceId || 'default')
    .map(toRecord);
}

// ===== 用户显式操作（「记住…」/「忘了…」）=====

export interface RememberOptions {
  type?: WorkspaceMemoryType;
  workspaceId?: string;
  evidence?: string;
}

/**
 * 用户明确要求记住 → 直接进入长期记忆。
 * 用户的显式意图本身就构成授权，不再要求二次审核。
 */
export function rememberForUser(content: string, opts: RememberOptions = {}): MemoryRecord {
  return submitMemory({
    content,
    source: 'user',
    type: opts.type,
    workspaceId: opts.workspaceId,
    evidence: opts.evidence ?? '用户显式指令',
    autoConfirm: true,
  });
}

/**
 * 用户要求忘记 → 把匹配的记忆标记为 rejected（不物理删除，便于回溯），
 * 连带其 Obsidian 笔记会在下次同步时移入归档区。
 */
export function forgetForUser(
  query: string,
  opts: { workspaceId?: string } = {},
): { forgotten: number; records: MemoryRecord[] } {
  const target = query.trim();
  if (!target) return { forgotten: 0, records: [] };
  const matched = workspaceMemoryHub.search(target, 200, opts.workspaceId || 'default');
  const records: MemoryRecord[] = [];
  for (const m of matched) {
    if ((m.status ?? 'confirmed') === 'rejected') continue;
    const updated = workspaceMemoryHub.setStatus(m.id, 'rejected');
    if (updated) records.push(toRecord(updated));
  }
  return { forgotten: records.length, records };
}

export interface ContextPackOptions {
  workspaceId?: string;
  /** 当前项目；传空表示不限项目 */
  projectId?: string;
  /** 是否包含用户级（私人）记忆，默认 false —— 私人记忆默认不外发 */
  includeUserScope?: boolean;
  query?: string;
  limit?: number;
}

/**
 * 组装发给外部智能体 / LLM 的上下文包。
 *
 * 这是「取消全量共享」的落点：不再是"把工作区全部记忆倒给对方"，
 * 而是按明确边界（当前任务 + 当前项目 + 用户授权范围）挑选已确认记忆。
 */
export function buildContextPack(opts: ContextPackOptions = {}): MemoryRecord[] {
  const workspaceId = opts.workspaceId || 'default';
  const limit = opts.limit ?? 50;
  const rows = opts.query?.trim()
    ? workspaceMemoryHub.searchConfirmed(opts.query, limit * 2, workspaceId)
    : workspaceMemoryHub.searchConfirmed(undefined, limit * 2, workspaceId);

  return rows
    .filter((m) => (opts.includeUserScope ? true : (m.scope ?? 'project') !== 'user'))
    .filter((m) => (opts.projectId ? (m.projectId ?? '') === '' || (m.projectId ?? '') === opts.projectId : true))
    .slice(0, limit)
    .map(toRecord);
}

/**
 * 把「已确认」的记忆同步到 Obsidian（长期记忆权威）。
 * 候选与已拒绝不会被写入。
 */
export function syncMemoriesToObsidian(
  workspaceId = 'default',
  vaultPath?: string,
): { count: number; dir: string; archived: string[] } {
  const confirmed = workspaceMemoryHub.listConfirmed(workspaceId);
  return syncWorkspaceMemoriesToObsidian(confirmed, vaultPath ?? defaultVaultPath());
}

/**
 * 从 Obsidian 读回并**重建** SQLite 索引。
 *
 * 权威方向：Obsidian → SQLite。用户在 Obsidian 中修改了内容、改了 status，
 * 或新增了符合格式的笔记，都可经此重建，以 Obsidian 的内容为准。
 */
export function importFromObsidian(vaultPath?: string): {
  scanned: number;
  imported: number;
  updated: number;
  skipped: number;
  dir: string;
} {
  const vault = vaultPath ?? defaultVaultPath();
  const dir = memoryDir(vault);
  const notes = readMemoryNotes(vault);
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const n of notes) {
    if (!n.content) { skipped++; continue; }
    const existing = workspaceMemoryHub.get(n.id);
    if (!existing) {
      workspaceMemoryHub.upsert({
        id: n.id,
        content: n.content,
        type: n.type as WorkspaceMemoryType,
        sourceAgent: n.sourceAgent,
        source: n.sourceAgent,
        status: n.status as MemoryStatus,
        scope: n.scope as MemoryScope,
        evidence: n.evidence,
        workspaceId: 'default',
      });
      imported++;
      continue;
    }
    const sameContent = existing.content === n.content;
    const sameStatus = (existing.status ?? 'confirmed') === n.status;
    if (sameContent && sameStatus) { skipped++; continue; }
    workspaceMemoryHub.upsert({
      id: n.id,
      content: n.content,
      type: (n.type as WorkspaceMemoryType) || existing.type,
      sourceAgent: n.sourceAgent || existing.sourceAgent,
      source: existing.source ?? n.sourceAgent,
      status: n.status as MemoryStatus,
      scope: (n.scope as MemoryScope) || existing.scope,
      evidence: n.evidence || existing.evidence,
      workspaceId: existing.workspaceId ?? 'default',
    });
    updated++;
  }

  return { scanned: notes.length, imported, updated, skipped, dir };
}

/**
 * 一次性迁移：把旧 `memories` 表的存量记录迁入**候选队列**。
 *
 * 架构约定：对话提取的内容默认不是长期记忆，因此一律作为候选，需用户审核。
 * 旧表保留（只读回溯），不再参与读写主路径。
 * 幂等：以 evidence 标记 `legacy:<旧id>` 判重，重复执行不产生副本。
 */
export function migrateLegacyMemories(): { migrated: number; skipped: number } {
  const legacy = new MemoryRepository().findAll();
  if (legacy.length === 0) return { migrated: 0, skipped: 0 };

  const markers = new Set(
    workspaceMemoryHub.listAll('default').map((m) => m.evidence ?? ''),
  );

  let migrated = 0;
  let skipped = 0;
  for (const m of legacy) {
    const marker = `legacy:${m.id}`;
    if (markers.has(marker)) { skipped++; continue; }
    try {
      workspaceMemoryHub.add({
        content: m.content,
        type: m.type as WorkspaceMemoryType,
        sourceAgent: 'legacy',
        source: 'legacy',
        status: 'candidate',
        evidence: marker,
        workspaceId: 'default',
      });
      markers.add(marker);
      migrated++;
    } catch {
      skipped++;
    }
  }
  return { migrated, skipped };
}

/** 统一记忆入口门面（供路由、技能与对话链路使用） */
export const memoryService = {
  submit: submitMemory,
  confirm: confirmMemory,
  reject: rejectMemory,
  listPending: listPendingMemories,
  listConfirmed: listConfirmedMemories,
  recall: recallMemories,
  recallByKeywords,
  remember: rememberForUser,
  forget: forgetForUser,
  buildContextPack,
  syncToObsidian: syncMemoriesToObsidian,
  importFromObsidian,
  migrateLegacy: migrateLegacyMemories,
};
