/**
 * 活动周期聚合器：每 10 分钟把观察记录经 LLM 汇总为一条「活动周期」
 *
 * - 周期名：用户正在做的项目名（如「玩《荒野大镖客2》」「写 2026年中报告」）
 * - 分类：工作 / 学习 / 娱乐 / 社交 / 其他
 * - 融合近 4 个周期的名称作为上下文，保证连续活动命名一致
 * - 无观察记录 → 记为「空闲」（强度 0，热力图留白）
 */
import { getDb } from '../db/connection.js';
import { getLlmProvider, type LlmMessage } from './llmProvider.js';
import { config } from '../config.js';

export const PERIOD_MS = 10 * 60 * 1000;

export const ACTIVITY_CATEGORIES = ['工作', '学习', '娱乐', '社交', '其他'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export interface ActivityPeriod {
  id: number;
  start_ts: number;
  end_ts: number;
  name: string;
  category: ActivityCategory;
  tag: string | null;
  observation_count: number;
}

/** 汇总用 LLM 调用（可注入测试） */
export type SummarizeFn = (
  descriptions: string[],
  recentNames: string[],
) => Promise<{ name: string; category: ActivityCategory }>;

async function summarizeViaLlm(
  descriptions: string[],
  recentNames: string[],
): Promise<{ name: string; category: ActivityCategory }> {
  const messages: LlmMessage[] = [
    {
      role: 'system',
      content:
        '你是行为记录分析师。根据屏幕观察记录，输出用户这10分钟正在做的活动的 JSON：' +
        '{"name":"活动/项目名（如 玩《荒野大镖客2》、写2026年中报告、浏览B站）",' +
        '"category":"工作|学习|娱乐|社交|其他 之一"}。' +
        '要求：1) name 用简短具体的项目名，若与近期活动相同请沿用同名；2) 只输出 JSON，不要多余文字。',
    },
    {
      role: 'user',
      content: JSON.stringify({
        recentActivities: recentNames,
        observations: descriptions.slice(0, 40).map((d) => d.slice(0, 200)),
      }),
    },
  ];

  let text = '';
  await getLlmProvider().request(
    messages,
    {
      model: config.deepseekModel,
      baseUrl: config.deepseekBaseUrl,
      providerName: 'DeepSeek',
      apiKey: config.deepseekApiKey,
      requiresKey: true,
      stream: false,
      maxTokens: 200,
      temperature: 0.2,
      thinkingDisabled: true,
      signal: AbortSignal.timeout(30_000),
    },
    {
      onChunk: (chunk) => { text += chunk; },
      onComplete: (full) => { text = full; },
      onError: () => { text = ''; },
    },
  );

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as { name?: string; category?: string };
      const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 60) : null;
      const raw = typeof parsed.category === 'string' ? parsed.category.trim() : '';
      const category = (ACTIVITY_CATEGORIES as readonly string[]).includes(raw)
        ? (raw as ActivityCategory)
        : '其他';
      if (name) return { name, category };
    } catch { /* JSON 解析失败走默认 */ }
  }
  return { name: '未知活动', category: '其他' };
}

/** 从上次周期结束（或起点）到现在，聚合一个活动周期 */
export async function aggregateOnce(
  now = Date.now(),
  summarize: SummarizeFn = summarizeViaLlm,
): Promise<ActivityPeriod | null> {
  const db = getDb();

  const last = db
    .prepare('SELECT end_ts FROM activity_periods ORDER BY end_ts DESC LIMIT 1')
    .get() as { end_ts: number } | undefined;
  const start = last ? Math.min(last.end_ts, now) : now - PERIOD_MS;
  const end = now;
  if (end - start < 30_000) return null; // 窗口过短跳过

  const rows = db
    .prepare('SELECT description FROM vision_observations WHERE ts > ? AND ts <= ? ORDER BY ts')
    .all(start, end) as { description: string }[];

  const count = rows.length;
  let result: { name: string; category: ActivityCategory };
  if (count === 0) {
    result = { name: '空闲', category: '其他' };
  } else {
    const recents = db
      .prepare('SELECT name FROM activity_periods ORDER BY end_ts DESC LIMIT 4')
      .all() as { name: string }[];
    try {
      result = await summarize(
        rows.map((r) => r.description),
        recents.map((r) => r.name),
      );
    } catch {
      result = { name: '未知活动', category: '其他' };
    }
  }

  const info = db
    .prepare(
      'INSERT INTO activity_periods (start_ts, end_ts, name, category, observation_count) VALUES (?, ?, ?, ?, ?)',
    )
    .run(start, end, result.name, result.category, count);

  return {
    id: Number(info.lastInsertRowid),
    start_ts: start,
    end_ts: end,
    name: result.name,
    category: result.category,
    tag: null,
    observation_count: count,
  };
}

/** 当天（本地时区）活动周期 + 分类计数 */
export function listToday(now = Date.now()): {
  periods: ActivityPeriod[];
  counts: Record<string, number>;
} {
  const db = getDb();
  const d = new Date(now);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const periods = db
    .prepare('SELECT * FROM activity_periods WHERE start_ts >= ? AND start_ts < ? ORDER BY start_ts')
    .all(dayStart, dayEnd) as ActivityPeriod[];

  const counts: Record<string, number> = {};
  for (const p of periods) counts[p.category] = (counts[p.category] ?? 0) + 1;
  return { periods, counts };
}

/** 编辑周期（重命名/分类/标签） */
export function updatePeriod(
  id: number,
  patch: { name?: string; category?: string; tag?: string | null },
): boolean {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | null)[] = [];
  if (typeof patch.name === 'string' && patch.name.trim()) {
    sets.push('name = ?');
    values.push(patch.name.trim().slice(0, 60));
  }
  if (typeof patch.category === 'string' && (ACTIVITY_CATEGORIES as readonly string[]).includes(patch.category)) {
    sets.push('category = ?');
    values.push(patch.category);
  }
  if (patch.tag !== undefined) {
    sets.push('tag = ?');
    values.push(patch.tag === null ? null : String(patch.tag).slice(0, 30));
  }
  if (sets.length === 0) return false;
  const info = db.prepare(`UPDATE activity_periods SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  return info.changes > 0;
}
