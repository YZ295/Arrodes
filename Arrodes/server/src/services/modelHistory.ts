/**
 * 模型可见消息的投影（借鉴 DeepSeek Harness：模型可见 ⟺ 已记录）
 *
 * - deriveSessionHistory：从会话日志（messages 表）投影出模型历史。
 * - assembleModelMessages：把画像 / 记忆 / 技能提示 / 历史 / 当前输入按序组装为模型消息。
 */
import type { MemoryNode, Message } from '../../../shared/types/index.js';
import { MessageRepository } from '../db/message-repo.js';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function assembleModelMessages(input: {
  profile?: string;
  memories?: MemoryNode[];
  skillsPrompt?: string;
  history: Message[];
  userMessage?: string;
  maxHistory?: number;
}): ModelMessage[] {
  const messages: ModelMessage[] = [];

  if (input.profile) {
    messages.push({ role: 'system', content: input.profile });
  }
  if (input.memories && input.memories.length > 0) {
    const memoryText = input.memories
      .map((m) => `- ${m.content}（类型: ${m.type}）`)
      .join('\n');
    messages.push({
      role: 'system',
      content: `以下是与本次对话相关的过往记忆：\n${memoryText}\n\n请自然地引用这些记忆。`,
    });
  }
  if (input.skillsPrompt) {
    messages.push({ role: 'system', content: input.skillsPrompt });
  }

  const history = input.maxHistory != null
    ? input.history.slice(-input.maxHistory)
    : input.history;
  for (const h of history) {
    messages.push({ role: h.role, content: h.content });
  }

  if (input.userMessage) {
    messages.push({ role: 'user', content: input.userMessage });
  }

  return messages;
}

export function deriveSessionHistory(sessionId: string, limit = 10): Message[] {
  return new MessageRepository().findBySession(sessionId).slice(-limit);
}
