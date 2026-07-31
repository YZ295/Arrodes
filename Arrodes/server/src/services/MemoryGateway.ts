/**
 * 记忆网关 (MemoryGateway) v2
 *
 * 智能体核心能力 — 自动记忆管理闭环：
 *
 * 对话前：检索相关记忆 + 画像 → 注入 LLM 上下文
 *       ┌─ 往期记忆（关键词匹配）
 *       ├─ 用户画像（偏好/习惯/身份）
 *       └─ 最近对话摘要
 *
 * 对话后：提取记忆 + 更新画像
 *       ├─ LLM 分析 → 提取事实/偏好/事件/任务
 *       ├─ 存储到 SQLite (MemoryRepository)
 *       └─ 更新用户画像 JSON
 */
import { MemoryRepository } from '../db/memory-repo.js';
import { MessageRepository } from '../db/message-repo.js';
import { LlmService } from './llmService.js';
import type { MemoryNode } from '../../../shared/types/index.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ===== 画像存储 =====

const PROFILE_DIR = './data';
const PROFILE_PATH = join(PROFILE_DIR, 'user_profile.json');

interface UserProfile {
  /** 用户称呼 */
  name?: string;
  /** 基本事实 */
  facts: Record<string, string>;
  /** 偏好列表 */
  preferences: string[];
  /** 兴趣爱好 */
  interests: string[];
  /** 重要事件 */
  events: Array<{ date?: string; description: string }>;
  /** 待办任务 */
  tasks: string[];
  /** 最近更新 */
  lastUpdated: string;
  /** 对话次数 */
  conversationCount: number;
}

export function loadProfile(): UserProfile {
  if (!existsSync(PROFILE_PATH)) {
    return {
      facts: {},
      preferences: [],
      interests: [],
      events: [],
      tasks: [],
      lastUpdated: new Date().toISOString(),
      conversationCount: 0,
    };
  }
  try {
    return JSON.parse(readFileSync(PROFILE_PATH, 'utf-8'));
  } catch {
    return { facts: {}, preferences: [], interests: [], events: [], tasks: [], lastUpdated: '', conversationCount: 0 };
  }
}

function saveProfile(profile: UserProfile): void {
  mkdirSync(PROFILE_DIR, { recursive: true });
  profile.lastUpdated = new Date().toISOString();
  writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf-8');
}

// ===== 记忆网关 =====

const memoryRepo = new MemoryRepository();
const messageRepo = new MessageRepository();
const llmService = new LlmService();

/**
 * 根据用户消息检索需要注入的上下文
 */
export async function retrieveContext(
  query: string,
  sessionId: string,
): Promise<{
  memories: MemoryNode[];
  profile: string;
  summary: string;
}> {
  // 1. 关键词检索往期记忆
  const keywords = extractKeywords(query);
  const memories = keywords.length > 0
    ? memoryRepo.searchAll(keywords).filter((m) => m.sessionId !== sessionId).slice(0, 5)
    : [];

  // 2. 加载用户画像
  const profile = loadProfile();
  const profileText = buildProfileContext(profile);

  // 3. 最近对话摘要（最近 6 条消息）
  const recent = messageRepo.findBySession(sessionId).slice(-6);
  const summary = recent.length > 0
    ? recent.map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content.slice(0, 80)}`).join('\n')
    : '';

  return { memories, profile: profileText, summary };
}

/**
 * 对话后处理：LLM 分析 → 提取记忆 → 更新画像
 */
export async function processConversation(
  sessionId: string,
  userMessage: string,
  aiReply: string,
): Promise<{ newMemories: MemoryNode[]; profileUpdated: boolean }> {
  // 1. 用 LLM 分析对话，提取结构化记忆
  const analysis = await analyzeConversation(userMessage, aiReply);
  if (!analysis) return { newMemories: [], profileUpdated: false };

  // 2. 存储记忆到 SQLite
  const newMemories: MemoryNode[] = [];
  for (const item of analysis.memories) {
    const node = memoryRepo.create({ sessionId, content: item.content, type: item.type });
    newMemories.push(node);
  }

  // 3. 更新画像
  const profile = loadProfile();
  profile.conversationCount++;

  // 合并新事实
  if (analysis.profile) {
    for (const [key, value] of Object.entries(analysis.profile.facts || {})) {
      profile.facts[key] = value;
    }
    for (const p of analysis.profile.preferences || []) {
      if (!profile.preferences.includes(p)) profile.preferences.push(p);
    }
    for (const i of analysis.profile.interests || []) {
      if (!profile.interests.includes(i)) profile.interests.push(i);
    }
    for (const e of analysis.profile.events || []) {
      profile.events.push(e);
    }
    for (const t of analysis.profile.tasks || []) {
      if (!profile.tasks.includes(t)) profile.tasks.push(t);
    }
  }

  saveProfile(profile);

  return { newMemories, profileUpdated: true };
}

/**
 * 用 LLM 分析单轮对话，提取记忆 + 画像更新
 */
async function analyzeConversation(
  userMessage: string,
  aiReply: string,
): Promise<{
  memories: Array<{ content: string; type: 'fact' | 'preference' | 'event' | 'task' }>;
  profile: Partial<UserProfile>;
} | null> {
  const prompt = [
    '分析以下对话，提取用户的关键信息用于记忆存储和画像更新。',
    '请以严格 JSON 格式回复，不要包含任何其他文字。',
    '',
    `用户: ${userMessage}`,
    `AI: ${aiReply.slice(0, 500)}`,
    '',
    'JSON 格式：',
    '{',
    '  "memories": [',
    '    { "content": "用户说喜欢咖啡", "type": "preference" }',
    '  ],',
    '  "profile": {',
    '    "facts": { "职业": "程序员" },',
    '    "preferences": ["咖啡"],',
    '    "interests": ["科幻电影"],',
    '    "events": [{ "description": "明天开会" }],',
    '    "tasks": ["记得查收邮件"]',
    '  }',
    '}',
    '',
    '规则：',
    '- 只提取有明确依据的信息，不要猜测',
    '- memories.type: fact/preference/event/task',
    '- 如果本轮没有可提取的信息，返回空数组和空对象',
  ].join('\n');

  try {
    let result = '';
    await llmService.chatSimple([
      { role: 'system', content: '你是一个记忆分析器，只输出 JSON。' },
      { role: 'user', content: prompt },
    ], {
      onChunk: (text) => { result += text; },
      onComplete: () => {},
      onError: () => {},
    });

    // 等待非流式完成
    await new Promise((r) => setTimeout(r, 500));
    if (!result) return null;

    // 尝试从结果中提取 JSON
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('[MemoryGateway] LLM 分析失败:', err);
    return null;
  }
}

/**
 * 构建用户画像上下文文本
 */
function buildProfileContext(profile: UserProfile): string {
  const parts: string[] = [];

  if (Object.keys(profile.facts).length > 0) {
    const facts = Object.entries(profile.facts)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');
    parts.push(`**已知用户信息：**\n${facts}`);
  }

  if (profile.preferences.length > 0) {
    parts.push(`**用户偏好：** ${profile.preferences.join(', ')}`);
  }

  if (profile.interests.length > 0) {
    parts.push(`**用户兴趣：** ${profile.interests.join(', ')}`);
  }

  if (profile.tasks.length > 0) {
    parts.push(`**待办任务：** ${profile.tasks.join(', ')}`);
  }

  if (parts.length === 0) return '';

  return `\n## 用户画像\n${parts.join('\n')}\n`;
}

// ===== 关键词提取 =====

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '你', '他', '她', '它', '们', '这', '那',
    '不', '也', '就', '都', '而', '和', '与', '或', '有', '没', '把', '被',
    '让', '给', '对', '从', '到', '上', '下', '大', '小', '好', '还', '又',
    '要', '会', '能', '可', '去', '来', '个', '之', '吗', '吧', '呢', '啊',
  ]);
  const tokens = text
    .replace(/[^\u4e00-\u9fff\w]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t) && !/^\d+$/.test(t));
  return [...new Set(tokens)];
}
