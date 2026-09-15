import { config } from '../config.js';
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
import { MemoryRepository, type MemoryRowWithSession } from '../db/memory-repo.js';
import { MessageRepository } from '../db/message-repo.js';
import { LlmService } from './llmService.js';
import type { MemoryNode } from '../../../shared/types/index.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { listConfirmedMemories, recallByKeywords, submitMemory } from './memoryService.js';
import type { WorkspaceMemoryType } from '../workspace/memory-hub.js';

// ===== 画像（派生视图） =====

/** meta 文件只保存运行状态（对话计数），不再保存画像事实 */
const PROFILE_DIR = config.dbPath;
const PROFILE_PATH = join(PROFILE_DIR, 'user_profile.json');

/**
 * 用户画像（派生视图）
 *
 * 画像不拥有任何事实：所有字段都从「已确认的长期记忆」实时派生，
 * 因此删除一条长期记忆后画像自动随之更新，不会出现两边矛盾。
 */
interface UserProfile {
  /** 用户称呼 */
  name?: string;
  /** 基本事实（含项目决策） */
  facts: string[];
  /** 稳定偏好 */
  preferences: string[];
  /** 兴趣爱好 */
  interests: string[];
  /** 长期目标 */
  goals: string[];
  /** 重要事件 */
  events: Array<{ date?: string; description: string }>;
  /** 待办任务 */
  tasks: string[];
  /** 最近更新 */
  lastUpdated: string;
  /** 对话次数（运行状态） */
  conversationCount: number;
  /** 派生来源：已确认长期记忆条数 */
  sourceMemoryCount: number;
}

interface ProfileMeta {
  conversationCount: number;
}

function loadProfileMeta(): ProfileMeta {
  try {
    if (!existsSync(PROFILE_PATH)) return { conversationCount: 0 };
    const raw = JSON.parse(readFileSync(PROFILE_PATH, 'utf-8')) as { conversationCount?: unknown };
    return { conversationCount: Number(raw?.conversationCount) || 0 };
  } catch {
    return { conversationCount: 0 };
  }
}

function saveProfileMeta(meta: ProfileMeta): void {
  mkdirSync(PROFILE_DIR, { recursive: true });
  writeFileSync(
    PROFILE_PATH,
    JSON.stringify({ conversationCount: meta.conversationCount, lastUpdated: new Date().toISOString() }, null, 2),
    'utf-8',
  );
}

/**
 * 从「已确认长期记忆」派生用户画像。
 * 画像不是事实的持有者——删掉记忆，画像就会跟着变。
 */
export function deriveProfile(
  memories = listConfirmedMemories(),
): Omit<UserProfile, 'conversationCount'> {
  const facts: string[] = [];
  const preferences: string[] = [];
  const interests: string[] = [];
  const goals: string[] = [];
  const events: Array<{ date?: string; description: string }> = [];
  const tasks: string[] = [];

  for (const m of memories) {
    switch (m.type) {
      case 'preference': preferences.push(m.content); break;
      case 'goal': goals.push(m.content); break;
      case 'event': events.push({ date: m.createdAt.slice(0, 10), description: m.content }); break;
      case 'task': tasks.push(m.content); break;
      case 'note': interests.push(m.content); break;
      case 'fact':
      case 'decision':
      default: facts.push(m.content); break;
    }
  }

  const dedupe = (arr: string[]): string[] => [...new Set(arr)];
  return {
    facts: dedupe(facts),
    preferences: dedupe(preferences),
    interests: dedupe(interests),
    goals: dedupe(goals),
    events,
    tasks: dedupe(tasks),
    lastUpdated: new Date().toISOString(),
    sourceMemoryCount: memories.length,
  };
}

/** 当前用户画像 = 派生字段 + 运行状态计数 */
export function loadProfile(): UserProfile {
  const meta = loadProfileMeta();
  return { ...deriveProfile(), conversationCount: meta.conversationCount };
}

// ===== 记忆网关 =====

const memoryRepo = new MemoryRepository();
const messageRepo = new MessageRepository();
const llmService = new LlmService();

/**
 * 根据用户消息检索需要注入的上下文
 */
/** 常见中文姓氏（人物识别用） */
const CN_SURNAMES = new Set(['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗', '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧', '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕', '苏', '卢', '蒋', '蔡', '贾', '丁', '魏', '薛', '叶', '阎', '余', '潘', '杜', '戴', '夏', '钟', '汪', '田', '任', '姜', '范', '方', '石', '姚', '谭', '廖', '邹', '熊', '金', '陆', '郝', '孔', '白', '崔', '康', '毛', '邱', '秦', '江', '史', '顾', '侯', '邵', '孟', '龙', '万', '段', '雷', '钱', '汤', '尹', '黎', '易', '常', '武', '乔', '贺', '赖', '龚', '文']);

/** 从记忆中识别人物实体（中文人名 + 英文人名），去重返回 */
export function extractPersonEntities(memories: Array<{ content: string }>): string[] {
  const persons = new Set<string>();
  // 排除"姓氏+常用词"误报（非人名）
  const STOP_WORDS = new Set(['高兴', '高级', '高大', '马上', '大家', '安全', '认真', '重要', '容易', '方便', '简单', '清楚', '熟悉', '了解', '支持', '喜欢', '可以', '应该', '能够']);

  for (const m of memories) {
    // 1. 英文人名：单词首字母大写、长度≥2、非句首常见词
    const engMatches = m.content.match(/\b[A-Z][a-z]{1,10}\b/g) || [];
    for (const w of engMatches) {
      if (/^(The|This|That|What|How|When|Where|Why|I|You|He|She|It|We|They|Hello|Hi|Yes|No|OK|Please)$/i.test(w)) continue;
      persons.add(w);
    }

    // 2. 中文人名：常见姓氏 + 恰好 1 个名字（2 字人名；3 字易误报故不收）
    //    不设前后边界——中文人名在句中天然被中文字包围（如"和张三一起"）
    for (const surname of CN_SURNAMES) {
      const re = new RegExp(`${surname}[\\u4e00-\\u9fa5]`, 'g');
      const matches = m.content.match(re) || [];
      for (const name of matches) {
        if (!STOP_WORDS.has(name)) {
          persons.add(name);
        }
      }
    }
  }
  return Array.from(persons);
}

/**
 * 记忆召回排序（阶段2）：相关性 = 关键词命中数（主导）× 时间衰减（辅助）
 * 命中数不同 → 命中多的优先；命中数相同 → 更新的优先
 */
export function rankMemories<T extends { id: string; content: string; createdAt: string }>(
  memories: T[],
  keywords: string[],
  now = Date.now(),
): T[] {
  if (keywords.length === 0) return [...memories];

  const scored = memories.map((m) => {
    const hits = keywords.filter((k) => m.content.includes(k)).length;
    // 时间衰减：7 天内线性衰减，超过按 0.2 最低权重
    const ageMs = Math.max(0, now - Date.parse(m.createdAt));
    const ageDays = ageMs / 86_400_000;
    const timeWeight = ageDays <= 7 ? 1 - (ageDays / 7) * 0.8 : 0.2;
    return { m, hits, timeWeight };
  });

  return scored
    .sort((a, b) => {
      // 命中词数主导
      if (b.hits !== a.hits) return b.hits - a.hits;
      // 命中相同 → 时间权重
      return b.timeWeight - a.timeWeight;
    })
    .map((s) => s.m);
}

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
  // 1. 统一召回：只取「已确认」长期记忆（候选与已拒绝不得进入上下文）
  //    经统一入口 memoryService，不再直接读旧 memories 表
  const keywords = extractKeywords(query);
  const memories: MemoryNode[] = recallByKeywords(keywords, { limit: 8 }).map((m) => ({
    id: m.id,
    content: m.content,
    type: m.type as MemoryNode['type'],
    createdAt: m.createdAt,
  }));

  // 2. 加载用户画像（从已确认长期记忆派生）
  const profile = loadProfile();
  const profileText = buildProfileContext(profile);

  // 3. 最近对话摘要（最近 6 条消息）—— 属于运行状态，不是长期记忆
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

  // 2. 收集候选：LLM 提取的记忆 + 画像字段，批内去重后经统一入口提交。
  //    不再写旧 memories 表——对话提取默认不是长期记忆，必须经审核。
  const evidence = `会话 ${sessionId}`;
  const candidates: Array<{ content: string; type: WorkspaceMemoryType; evidence: string }> = [];
  for (const item of analysis.memories) {
    if (item.content?.trim()) candidates.push({ content: item.content.trim(), type: item.type, evidence });
  }
  if (analysis.profile) {
    const rawFacts = (analysis.profile as { facts?: unknown }).facts;
    if (Array.isArray(rawFacts)) {
      for (const v of rawFacts) {
        if (String(v).trim()) candidates.push({ content: String(v).trim(), type: 'fact', evidence: `${evidence} · 画像` });
      }
    } else if (rawFacts && typeof rawFacts === 'object') {
      for (const v of Object.values(rawFacts as Record<string, unknown>)) {
        if (String(v).trim()) candidates.push({ content: String(v).trim(), type: 'fact', evidence: `${evidence} · 画像` });
      }
    }
    for (const p of analysis.profile.preferences || []) {
      if (String(p).trim()) candidates.push({ content: String(p).trim(), type: 'preference', evidence: `${evidence} · 画像` });
    }
    for (const i of analysis.profile.interests || []) {
      if (String(i).trim()) candidates.push({ content: String(i).trim(), type: 'goal', evidence: `${evidence} · 画像` });
    }
    for (const e of analysis.profile.events || []) {
      const text = String(e?.description ?? '').trim();
      if (text) candidates.push({ content: text, type: 'event', evidence: `${evidence} · 画像` });
    }
    for (const t of analysis.profile.tasks || []) {
      if (String(t).trim()) candidates.push({ content: String(t).trim(), type: 'task', evidence: `${evidence} · 画像` });
    }
  }

  const newMemories: MemoryNode[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.content)) continue;
    seen.add(c.content);
    try {
      const rec = submitMemory({
        content: c.content,
        source: 'arrodes',
        type: c.type,
        evidence: c.evidence,
        workspaceId: 'default',
      });
      newMemories.push({
        id: rec.id,
        content: rec.content,
        type: rec.type as MemoryNode['type'],
        createdAt: rec.createdAt,
      });
    } catch {
      // 单条候选写入失败不影响整体流程
    }
  }

  // 3. 只更新运行状态计数：画像改为从已确认长期记忆派生，不再在此累积事实
  const meta = loadProfileMeta();
  meta.conversationCount++;
  saveProfileMeta(meta);

  return { newMemories, profileUpdated: true };
}

/**
 * 从 LLM 输出文本中解析记忆分析 JSON（纯函数，可单测）
 * LLM 可能夹带解释文字，提取第一个 {...} JSON 块解析
 */
export function parseAnalysisJson(text: string): {
  memories?: Array<{ content: string; type: 'fact' | 'preference' | 'event' | 'task' }>;
  profile?: Partial<UserProfile>;
} | null {
  if (!text) return null;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ===== 记忆整理（consolidate，借鉴 BaiLongma 主动记忆维护）=====

/** 计算两个文本的相似度：字符 bigram 的 Dice 系数（中文鲁棒；对短文本比 Jaccard 宽容） */
function diceSimilarity(a: string, b: string): number {
  const bigrams = (s: string): Set<string> => {
    const clean = s.replace(/[\s，。！？、,.!?；;：:""''（）()【】\[\]]/g, '');
    const set = new Set<string>();
    if (clean.length === 1) {
      set.add(clean);
      return set;
    }
    for (let i = 0; i < clean.length - 1; i++) {
      set.add(clean.slice(i, i + 2));
    }
    return set;
  };
  const sa = bigrams(a);
  const sb = bigrams(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  if (inter === 0) return 0;
  return (2 * inter) / (sa.size + sb.size);
}

export interface DuplicateGroup {
  /** 保留的记忆（较早创建） */
  keep: MemoryRowWithSession;
  /** 应删除的重复记忆 */
  remove: MemoryRowWithSession[];
}

/**
 * 找出相似记忆分组（纯函数，可单测）
 * 规则：同会话 + 同类型 + 文本相似度 ≥ 阈值 → 视为重复，保留较早创建的
 */
export function computeDuplicateGroups(
  memories: MemoryRowWithSession[],
  threshold = 0.75,
): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < memories.length; i++) {
    const mi = memories[i];
    // 跳过已被归入删除集的记忆
    if (groups.some((g) => g.remove.some((r) => r.id === mi.id))) continue;

    const removals: MemoryRowWithSession[] = [];
    for (let j = i + 1; j < memories.length; j++) {
      const mj = memories[j];
      if (mj.sessionId !== mi.sessionId || mj.type !== mi.type) continue;
      if (diceSimilarity(mi.content, mj.content) >= threshold) {
        removals.push(mj);
      }
    }
    if (removals.length > 0) {
      groups.push({ keep: mi, remove: removals });
    }
  }
  return groups;
}

/**
 * 执行记忆去重合并：删除重复记忆
 * @param repo 可注入（默认全局 memoryRepo）；测试可传 mock
 */
export async function consolidateMemories(
  repo: Pick<MemoryRepository, 'findAll' | 'delete'> = memoryRepo,
): Promise<{ scanned: number; removed: number }> {
  const all = repo.findAll();
  const groups = computeDuplicateGroups(all);

  let removed = 0;
  for (const g of groups) {
    for (const r of g.remove) {
      if (repo.delete(r.id)) removed++;
    }
  }
  return { scanned: all.length, removed };
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
    // 用 onComplete 信号等待真实完成（替代原 setTimeout(500) 伪等待）
    const result = await new Promise<string>((resolve, reject) => {
      let full = '';
      llmService.chatSimple([
        { role: 'system', content: '你是一个记忆分析器，只输出 JSON。' },
        { role: 'user', content: prompt },
      ], {
        onChunk: (text) => { full += text; },
        onComplete: (text) => { resolve(text || full); },
        onError: (err) => { reject(new Error(err)); },
      }).catch(reject);
    });

    const parsed = parseAnalysisJson(result);
    if (!parsed) return null;
    // 规范化：memories 缺失时给空数组（保持下游类型契约）
    return {
      memories: parsed.memories || [],
      profile: parsed.profile || {},
    };
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

  if (profile.facts.length > 0) {
    parts.push(`**已知用户信息：**\n${profile.facts.map((f) => `  ${f}`).join('\n')}`);
  }

  if (profile.preferences.length > 0) {
    parts.push(`**用户偏好：** ${profile.preferences.join('；')}`);
  }

  if (profile.interests.length > 0) {
    parts.push(`**用户兴趣：** ${profile.interests.join('；')}`);
  }

  if (profile.goals.length > 0) {
    parts.push(`**长期目标：** ${profile.goals.join('；')}`);
  }

  if (profile.tasks.length > 0) {
    parts.push(`**待办任务：** ${profile.tasks.join('；')}`);
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
