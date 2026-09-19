/**
 * 记忆管理面板
 * 可视化展示当前会话和跨会话记忆，支持搜索、过滤、删除
 *
 * 数据来源：
 * - 当前会话记忆：通过 /api/v1/memories 查询
 * - 全局记忆搜索：GET /api/v1/memories?q=xxx
 */
import { useState, useEffect, useCallback } from 'react';
import type { MemoryNode, MemoryType } from '@shared/types';
import { eventBus, EVENTS } from '../shared/events/EventBus';

type CandidateMemory = {
  id: string;
  content: string;
  type: string;
  source?: string;
  sourceAgent?: string;
  evidence?: string;
  confidence?: number;
  createdAt: string;
};

const candidateTypeLabels: Record<string, string> = {
  fact: '事实', preference: '偏好', decision: '决策', event: '事件',
  goal: '目标', task: '任务', note: '笔记',
};

/* ============================================================
 * MemoryCard — 单条记忆卡片
 * ============================================================ */
function MemoryCard({
  memory,
  onDelete,
}: {
  memory: MemoryNode;
  onDelete?: (id: string) => void;
}) {
  const typeLabels: Record<MemoryType, { label: string; color: string }> = {
    fact: { label: '事实', color: 'bg-blue-500/20 text-blue-300' },
    preference: { label: '偏好', color: 'bg-purple-500/20 text-purple-300' },
    event: { label: '事件', color: 'bg-green-500/20 text-green-300' },
    task: { label: '任务', color: 'bg-yellow-500/20 text-yellow-300' },
  };

  const typeInfo = typeLabels[memory.type] || typeLabels.fact;
  const timeAgo = getTimeAgo(new Date(memory.createdAt));

  return (
    <div className="group px-3 py-2.5 mx-1 rounded-lg hover:bg-white/5 transition-colors">
      <div className="flex items-start gap-2">
        {/* 类型标签 */}
        <span className={`shrink-0 text-[16px] px-1.5 py-0.5 rounded-full mt-0.5 ${typeInfo.color}`}>
          {typeInfo.label}
        </span>
        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 leading-relaxed">{memory.content}</p>
          <span className="text-[16px] text-gray-500 mt-1 block">{timeAgo}</span>
        </div>
        {/* 删除按钮 */}
        {onDelete && (
          <button
            onClick={() => onDelete(memory.id)}
            className="shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100
              hover:bg-red-500/20 text-red-200/60 hover:text-red-200 transition-all"
            title="删除记忆"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * MemoryPanel — 主面板
 * ============================================================ */
interface MemoryPanelProps {
  onClose: () => void;
}

export default function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [candidates, setCandidates] = useState<CandidateMemory[]>([]);
  const [persons, setPersons] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<MemoryType | 'all'>('all');
  const [currentSessionOnly, setCurrentSessionOnly] = useState(true);

  // 加载记忆列表
  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (currentSessionOnly) {
        // 通过 session 获取当前会话记忆
        // 需要从 URL 或 store 获取当前 sessionId
        const sessionId = new URLSearchParams(window.location.search).get('session') || '';
        if (sessionId) params.set('sessionId', sessionId);
      }

      const res = await fetch(`/api/v1/memories?${params.toString()}`);
      if (!res.ok) throw new Error(`加载记忆失败: ${res.status}`);
      const data = await res.json();
      setMemories(data.memories || []);
      setPersons(data.persons || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载记忆失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, currentSessionOnly]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    setReviewError(null);
    try {
      const res = await fetch('/api/v1/workspace/memories/pending');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `加载候选记忆失败: ${res.status}`);
      setCandidates(data.memories || []);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '加载候选记忆失败');
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  useEffect(() => { void loadCandidates(); }, [loadCandidates]);

  const reviewCandidate = useCallback(async (id: string, action: 'confirm' | 'reject') => {
    setReviewingId(id);
    setReviewError(null);
    try {
      const res = await fetch(`/api/v1/workspace/memories/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (action === 'confirm' ? '确认失败' : '拒绝失败'));
      setCandidates((items) => items.filter((item) => item.id !== id));
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '审核失败');
    } finally {
      setReviewingId(null);
    }
  }, []);

  // 人物卡点击人物 → 自动填入搜索词（事件驱动，避免跨组件耦合）
  useEffect(() => {
    return eventBus.on(EVENTS.MEMORY_SEARCH_REQUEST, (payload) => {
      const { query } = (payload || {}) as { query?: string };
      if (query) setSearchQuery(query);
    });
  }, []);

  // 删除记忆
  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/memories/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '删除失败';
      setError(msg);
    }
  }, []);

  // 计数
  const typeCount = memories.reduce((acc, m) => {
    acc[m.type] = (acc[m.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--color-home-gold)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="text-sm font-medium">记忆管理</span>
          <span className="text-[16px] text-gray-500">({memories.length}条)</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">&times;</button>
      </div>

      {/* 搜索栏 */}
      <div className="px-3 pt-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索记忆..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-200
              placeholder-gray-500 outline-none focus:border-[var(--color-home-gold)]/40 transition-colors"
          />
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex gap-1 flex-wrap">
          {(['all', 'fact', 'preference', 'event', 'task'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-[16px] px-2 py-0.5 rounded-full transition-colors ${
                typeFilter === t
                  ? 'bg-[var(--color-home-gold)]/20 text-[var(--color-home-gold)]'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {t === 'all' ? '全部' : { fact: '事实', preference: '偏好', event: '事件', task: '任务' }[t]}
              {t !== 'all' && typeCount[t] ? ` (${typeCount[t]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* 切换：当前会话/全局 */}
      <div className="px-3 pb-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <div
            onClick={() => setCurrentSessionOnly(!currentSessionOnly)}
            className={`w-8 h-4 rounded-full transition-colors relative ${
              currentSessionOnly ? 'bg-[var(--color-home-gold)]/50' : 'bg-white/10'
            }`}
          >
            <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${
              currentSessionOnly ? 'left-4' : 'left-0.5'
            }`} />
          </div>
          <span className="text-[16px] text-gray-400">仅当前会话</span>
        </label>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto">
        <section className="mx-3 mt-2 mb-3 rounded-xl border border-blue-400/15 bg-blue-400/[0.04] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
            <div>
              <h3 className="text-sm font-medium text-blue-100">待审核</h3>
              <p className="text-[11px] text-white/35 mt-0.5">确认后才会进入长期记忆</p>
            </div>
            <span className="min-w-6 h-6 px-1.5 rounded-full bg-blue-400/10 text-blue-200 text-xs flex items-center justify-center">
              {candidates.length}
            </span>
          </div>

          {reviewError && (
            <div role="alert" className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-lg bg-red-500/10 border border-red-400/15 px-3 py-2 text-xs text-red-200">
              <span className="min-w-0 break-words">{reviewError}</span>
              <button onClick={() => void loadCandidates()} className="shrink-0 rounded-md px-2 py-1 text-red-100 hover:bg-red-400/10">
                重试
              </button>
            </div>
          )}

          {candidatesLoading ? (
            <div className="px-3 py-5 text-center text-xs text-white/35">正在加载候选记忆…</div>
          ) : candidates.length === 0 ? (
            <div className="px-3 py-5 text-center text-xs text-white/35">暂无待审核记忆</div>
          ) : (
            <div className="divide-y divide-white/5">
              {candidates.map((candidate) => {
                const busy = reviewingId === candidate.id;
                const source = candidate.source || candidate.sourceAgent || '未知来源';
                return (
                  <article key={candidate.id} className="p-3">
                    <div className="flex items-center gap-2 text-[11px] text-white/40">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-blue-200/80">
                        {candidateTypeLabels[candidate.type] || candidate.type}
                      </span>
                      <span>来源：{source}</span>
                      {typeof candidate.confidence === 'number' && (
                        <span>可信度 {Math.round(candidate.confidence * 100)}%</span>
                      )}
                    </div>
                    <p className="mt-2 break-words text-sm leading-relaxed text-white/80">{candidate.content}</p>
                    {candidate.evidence && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">证据：{candidate.evidence}</p>
                    )}
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        data-role="memory-reject"
                        aria-label={`拒绝记忆：${candidate.content}`}
                        disabled={busy}
                        onClick={() => void reviewCandidate(candidate.id, 'reject')}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/55 hover:bg-white/5 hover:text-white disabled:opacity-40"
                      >
                        拒绝
                      </button>
                      <button
                        data-role="memory-confirm"
                        aria-label={`确认记忆：${candidate.content}`}
                        disabled={busy}
                        onClick={() => void reviewCandidate(candidate.id, 'confirm')}
                        className="rounded-lg bg-blue-500/20 border border-blue-400/20 px-3 py-1.5 text-xs text-blue-100 hover:bg-blue-500/30 disabled:opacity-40"
                      >
                        {busy ? '处理中…' : '确认记住'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* 人物卡区块（阶段2：记忆中出现的人物实体） */}
        {!loading && !error && persons.length > 0 && (
          <div className="px-3 pt-2 pb-1">
            <div className="text-[16px] text-gray-500 mb-1.5">👤 人物（{persons.length}）</div>
            <div className="flex flex-wrap gap-1.5">
              {persons.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-home-gold)]/10
                    border border-[var(--color-home-gold)]/20 text-[16px] text-[var(--color-home-gold)]"
                  title={`${name} 出现在记忆中`}
                >
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-400/60 to-blue-700/60
                    flex items-center justify-center text-[16px] font-bold text-white shrink-0">
                    {name[0]}
                  </span>
                  {name}
                </div>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="w-5 h-5 animate-spin text-gray-400" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.3" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        ) : error ? (
          <div className="px-4 py-3 text-[16px] text-red-300">{error}</div>
        ) : memories.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <svg className="w-8 h-8 mx-auto mb-2 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <p className="text-sm">暂无记忆</p>
            <p className="text-[16px] mt-1">和阿罗德斯对话，记忆会自动保存</p>
          </div>
        ) : (
          <div className="py-1">
            {memories.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== 工具函数 =====
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return '刚刚';
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHour < 24) return `${diffHour}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString('zh-CN');
}
