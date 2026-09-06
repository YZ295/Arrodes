/**
 * 显式记忆指令处理（借鉴 HoloJarvis："记住…"跨重启持久化）
 *
 * 识别用户消息中的显式记忆指令：
 * - "记住 X" / "记住：X" / "请记住 X" → 直接写入记忆库（type=preference 或按内容推断）
 * - "忘了 X" / "忘记 X" / "删除记忆 X" → 删除匹配的记忆
 *
 * 返回处理结果；未命中指令时返回 null（走正常 LLM 对话）。
 */
import { MemoryRepository } from '../db/memory-repo.js';
import type { MemoryType } from '../../../shared/types/index.js';

const memoryRepo = new MemoryRepository();

// 匹配"记住..."/"忘了..."，支持多种句式
const REMEMBER_RE = /^(?:请记住|记住|帮我记住|记一下)[:：\s，,]*([\s\S]{1,200})$/;
const FORGET_RE = /^(?:忘了|忘记|删掉记忆|删除记忆|忘掉)[:：\s，,]*([\s\S]{1,200})$/;

/** 根据内容推断记忆类型（含"喜欢/讨厌/偏好"→preference，日期→event，默认 fact） */
function inferType(content: string): MemoryType {
  if (/喜欢|讨厌|爱|偏好|想|希望|不喜欢/.test(content)) return 'preference';
  if (/明天|后天|下周|日期|生日|纪念日|开会|出差|几点|月|日/.test(content)) return 'event';
  if (/记得|需要|要做|待办|别忘了/.test(content)) return 'task';
  return 'fact';
}

export interface ExplicitMemoryResult {
  /** 已处理（true=是显式指令；false=非指令，走正常流程） */
  handled: boolean;
  /** 给用户的确认回复 */
  reply?: string;
  /** 写入/删除的记忆 id */
  memoryId?: string;
}

/** 尝试处理显式记忆指令 */
export function handleExplicitMemory(
  sessionId: string,
  content: string,
): ExplicitMemoryResult {
  const text = content.trim();

  // 1. 记住指令
  const remMatch = text.match(REMEMBER_RE);
  if (remMatch && remMatch[1].trim()) {
    const fact = remMatch[1].trim();
    const type = inferType(fact);
    const node = memoryRepo.create({ sessionId, content: fact, type });
    return {
      handled: true,
      reply: `记住了：${fact}（已保存为${type === 'preference' ? '偏好' : type === 'event' ? '事件' : type === 'task' ? '待办' : '事实'}记忆）`,
      memoryId: node.id,
    };
  }

  // 2. 忘记指令
  const forgetMatch = text.match(FORGET_RE);
  if (forgetMatch && forgetMatch[1].trim()) {
    const target = forgetMatch[1].trim();
    // 删除包含目标文本的记忆（按内容 LIKE 匹配）
    const all = memoryRepo.findAll();
    const matched = all.filter((m) => m.content.includes(target));
    if (matched.length === 0) {
      return { handled: true, reply: `没有找到关于「${target}」的记忆` };
    }
    for (const m of matched) {
      memoryRepo.delete(m.id);
    }
    return {
      handled: true,
      reply: `已忘记关于「${target}」的 ${matched.length} 条记忆`,
      memoryId: matched[0].id,
    };
  }

  return { handled: false };
}
