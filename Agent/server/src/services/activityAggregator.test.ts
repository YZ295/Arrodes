/**
 * 活动周期聚合器测试
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { setDbPathForTests, getDb, closeDb } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import {
  aggregateOnce,
  listToday,
  updatePeriod,
  type SummarizeFn,
} from './activityAggregator.js';

vi.mock('./llmProvider.js', () => ({
  getLlmProvider: vi.fn(),
}));

function seedObservation(ts: number, description: string): void {
  getDb().prepare('INSERT INTO vision_observations (ts, description) VALUES (?, ?)').run(ts, description);
}

const fakeSummarize = (name: string, category: '工作' | '学习' | '娱乐' | '社交' | '其他'): SummarizeFn =>
  async () => ({ name, category });

describe('activityAggregator', () => {
  beforeEach(() => {
    setDbPathForTests(':memory:');
    initSchema();
  });

  afterEach(() => {
    closeDb();
    vi.restoreAllMocks();
  });

  it('有观察记录时聚合出一个周期', async () => {
    const now = Date.now();
    seedObservation(now - 5 * 60_000, '用户正在 VSCode 中编写 React 组件');
    seedObservation(now - 2 * 60_000, '用户在浏览器查 React 文档');

    const period = await aggregateOnce(now, fakeSummarize('写 React 项目', '工作'));
    expect(period).not.toBeNull();
    expect(period?.name).toBe('写 React 项目');
    expect(period?.category).toBe('工作');
    expect(period?.observation_count).toBe(2);
  });

  it('窗口内无观察 → 记为空闲，不调用 LLM', async () => {
    const now = Date.now();
    const summarize = vi.fn(fakeSummarize('不该被调用', '工作'));
    const period = await aggregateOnce(now, summarize);
    expect(period?.name).toBe('空闲');
    expect(period?.observation_count).toBe(0);
    expect(summarize).not.toHaveBeenCalled();
  });

  it('窗口过短（<30s）跳过聚合', async () => {
    const now = Date.now();
    seedObservation(now - 60_000, 'x');
    await aggregateOnce(now, fakeSummarize('x', '工作'));
    // 紧接着再聚合：窗口只剩 <30s，应跳过
    const period = await aggregateOnce(now + 10_000, fakeSummarize('y', '工作'));
    expect(period).toBeNull();
  });

  it('LLM 失败时降级为未知活动', async () => {
    const now = Date.now();
    seedObservation(now - 60_000, '任意内容');
    const summarize = vi.fn(async () => {
      throw new Error('llm down');
    });
    const period = await aggregateOnce(now, summarize as unknown as SummarizeFn);
    expect(period?.name).toBe('未知活动');
    expect(period?.category).toBe('其他');
  });

  it('listToday 返回当天周期与分类计数', async () => {
    const now = Date.now();
    seedObservation(now - 5 * 60_000, 'a');
    await aggregateOnce(now, fakeSummarize('写周报', '工作'));
    seedObservation(now + 5 * 60_000, 'b');
    await aggregateOnce(now + 11 * 60_000, fakeSummarize('刷B站', '娱乐'));

    const { periods, counts } = listToday(now + 11 * 60_000);
    expect(periods.length).toBe(2);
    expect(counts['工作']).toBe(1);
    expect(counts['娱乐']).toBe(1);
  });

  it('updatePeriod 支持重命名/分类/标签', async () => {
    const now = Date.now();
    seedObservation(now - 60_000, 'a');
    const period = await aggregateOnce(now, fakeSummarize('写周报', '工作'));
    expect(period).not.toBeNull();

    expect(updatePeriod(period!.id, { name: '写季度报告', category: '工作', tag: '重要' })).toBe(true);
    const { periods } = listToday(now);
    expect(periods[0].name).toBe('写季度报告');
    expect(periods[0].tag).toBe('重要');

    expect(updatePeriod(99999, { name: 'x' })).toBe(false);
    expect(updatePeriod(period!.id, {})).toBe(false);
    expect(updatePeriod(period!.id, { category: '不合法' })).toBe(false);
  });
});
