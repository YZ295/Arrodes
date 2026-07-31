/**
 * 阿罗德斯记忆服务
 * 基于本地 SQLite，实现跨会话记忆检索与存储
 * 
 * 对话前检索：根据当前用户消息，在所有会话的记忆中查找相关内容
 * 对话后存储：从 AI 回复中提取记忆节点并持久化
 */
import { MemoryRepository } from '../db/memory-repo.js';
import { MessageRepository } from '../db/message-repo.js';
import type { MemoryNode } from '../../../shared/types/index.js';

const memoryRepo = new MemoryRepository();
const messageRepo = new MessageRepository();

/**
 * 检索与当前消息相关的跨会话记忆
 * @param query 用户消息
 * @param currentSessionId 当前会话 ID
 * @returns 相关记忆列表
 */
export async function retrieveMemories(
  query: string,
  currentSessionId: string,
): Promise<MemoryNode[]> {
  // 策略：按关键词匹配检索
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const allMemories = memoryRepo.searchAll(keywords);
  // 排除当前会话的记忆（避免重复注入上下文）
  return allMemories.filter((m) => m.sessionId !== currentSessionId);
}

/**
 * 从 AI 回复中提取并存储记忆
 * @param sessionId 当前会话 ID
 * @param userMessage 用户消息
 * @param aiReply AI 回复
 * @returns 新存储的记忆
 */
export async function storeMemories(
  sessionId: string,
  userMessage: string,
  aiReply: string,
): Promise<MemoryNode[]> {
  const extracted = extractMemoryCandidates(userMessage, aiReply);
  const stored: MemoryNode[] = [];

  for (const mem of extracted) {
    const node = memoryRepo.create({
      sessionId,
      content: mem.content,
      type: mem.type,
    });
    stored.push(node);
  }

  return stored;
}

/**
 * 获取最近 N 轮对话历史
 */
export function getRecentHistory(
  sessionId: string,
  count: number = 10,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messageRepo.findBySession(sessionId).slice(-count);
}

// ===== 简单的记忆提取与检索工具 =====

/**
 * 关键词提取
 */
function extractKeywords(text: string): string[] {
  // 过滤停用词后提取有意义的词
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '你', '他', '她', '它',
    '们', '这', '那', '不', '也', '就', '都', '而', '和',
    '与', '或', '有', '没', '把', '被', '让', '给', '对',
    '从', '到', '上', '下', '大', '小', '好', '还', '又',
    '要', '会', '能', '可', '去', '来', '个', '之', '吗',
    '吧', '呢', '啊', '哦', '嗯', '哈', '嘛',
  ]);

  // 简单分词：按非中文字符和空格分割
  const tokens = text
    .replace(/[^\u4e00-\u9fff\w]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t) && !/^\d+$/.test(t));

  return [...new Set(tokens)];
}

/**
 * 从对话中提取记忆候选
 * 简单启发式：用户提到的偏好/事实性信息
 */
function extractMemoryCandidates(
  userMessage: string,
  aiReply: string,
): Array<{ content: string; type: 'fact' | 'preference' | 'event' | 'task' }> {
  const candidates: Array<{
    content: string;
    type: 'fact' | 'preference' | 'event' | 'task';
  }> = [];

  // 偏好提取：用户说"我喜欢/我不喜欢/我习惯/我经常"
  const prefPatterns = [
    /我(?:喜欢|爱|最[爱喜]|偏好|偏(?:好|爱))(.{2,30})/,
    /我(?:不(?:喜欢|爱|吃|喝))(.{2,30})/,
    /我(?:习惯|经常|总是|通常)(.{2,30})/,
  ];
  for (const pattern of prefPatterns) {
    const match = userMessage.match(pattern);
    if (match) {
      candidates.push({
        content: `用户偏好: ${match[1].trim()}`,
        type: 'preference',
      });
    }
  }

  // 事实提取：AI 回复中提到"已记住"或"记住了"
  if (/已记住|记住了|收到|明白/i.test(aiReply)) {
    // 尝试从 AI 回复提取具体内容
    for (const line of aiReply.split('\n')) {
      const trimmed = line.replace(/^[*-]\s*/, '').trim();
      if (trimmed.length > 5 && trimmed.length < 100) {
        candidates.push({
          content: trimmed,
          type: 'fact',
        });
        break;
      }
    }
  }

  // 事件提取：用户提到时间相关
  const eventPattern = /(?:明天|后天|下周|下月|今天|今晚|星期[一二三四五六日天])\s*(.{2,40})/;
  const eventMatch = userMessage.match(eventPattern);
  if (eventMatch) {
    candidates.push({
      content: `用户事件: ${eventMatch[0].trim()}`,
      type: 'event',
    });
  }

  // 任务提取：用户说"帮我/请帮我/需要"等
  const taskPattern = /(?:帮我|请帮我|需要|烦请)(.{5,50})/;
  const taskMatch = userMessage.match(taskPattern);
  if (taskMatch) {
    candidates.push({
      content: `用户任务: ${taskMatch[1].trim()}`,
      type: 'task',
    });
  }

  return candidates;
}
