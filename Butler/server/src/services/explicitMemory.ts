/**
 * 显式记忆指令处理（"记住…" / "忘了…"）
 *
 * 只经**统一记忆入口** memoryService 读写长期记忆：
 * - "记住 X" → rememberForUser：用户显式意图即授权，直接进长期记忆
 * - "忘了 X" → forgetForUser：标记 rejected；Obsidian 笔记在下次同步时移入归档区
 *
 * 这样用户收到"记住了 / 已忘记"时，长期记忆与 Obsidian 的状态必然一致。
 * 未命中指令时返回 handled: false（走正常 LLM 对话）。
 */
import { rememberForUser, forgetForUser } from './memoryService.js';
import type { WorkspaceMemoryType } from '../workspace/memory-hub.js';

// 匹配"记住..."/"忘了..."，支持多种句式
const REMEMBER_RE = /^(?:请记住|记住|帮我记住|记一下)[:：\s，,]*([\s\S]{1,200})$/;
const FORGET_RE = /^(?:忘了|忘记|删掉记忆|删除记忆|忘掉)[:：\s，,]*([\s\S]{1,200})$/;

/** 根据内容推断记忆类型（含"喜欢/讨厌/偏好"→preference，日期→event，默认 fact） */
function inferType(content: string): WorkspaceMemoryType {
  if (/喜欢|讨厌|爱|偏好|想|希望|不喜欢/.test(content)) return 'preference';
  if (/明天|后天|下周|日期|生日|纪念日|开会|出差|几点|月|日/.test(content)) return 'event';
  if (/记得|需要|要做|待办|别忘了/.test(content)) return 'task';
  return 'fact';
}

function typeLabel(t: WorkspaceMemoryType): string {
  const names: Record<string, string> = {
    fact: '事实',
    preference: '偏好',
    event: '事件',
    task: '待办',
    decision: '决策',
    goal: '目标',
    note: '笔记',
  };
  return names[t] ?? '事实';
}

export interface ExplicitMemoryResult {
  /** 已处理（true=是显式指令；false=非指令，走正常流程） */
  handled: boolean;
  /** 给用户的确认回复 */
  reply?: string;
  /** 写入 / 失效的记忆 id */
  memoryId?: string;
}

/** 尝试处理显式记忆指令 */
export function handleExplicitMemory(
  sessionId: string,
  content: string,
): ExplicitMemoryResult {
  const text = content.trim();

  // 1. 记住指令 → 直接进入长期记忆
  const remMatch = text.match(REMEMBER_RE);
  if (remMatch && remMatch[1].trim()) {
    const fact = remMatch[1].trim();
    const type = inferType(fact);
    try {
      const record = rememberForUser(fact, {
        type,
        evidence: `用户显式指令 · 会话 ${sessionId}`,
      });
      return {
        handled: true,
        reply: `记住了：${fact}（已写入长期记忆 · ${typeLabel(type)}）`,
        memoryId: record.id,
      };
    } catch (err) {
      return {
        handled: true,
        reply: `记忆写入失败：${err instanceof Error ? err.message : '未知错误'}`,
      };
    }
  }

  // 2. 忘记指令 → 标记失效（不物理删除，笔记随同步归档）
  const forgetMatch = text.match(FORGET_RE);
  if (forgetMatch && forgetMatch[1].trim()) {
    const target = forgetMatch[1].trim();
    const { forgotten } = forgetForUser(target);
    if (forgotten === 0) {
      return { handled: true, reply: `没有找到关于「${target}」的记忆` };
    }
    return {
      handled: true,
      reply: `已忘记关于「${target}」的 ${forgotten} 条记忆（下次同步会一并从 Obsidian 移出）`,
    };
  }

  return { handled: false };
}
