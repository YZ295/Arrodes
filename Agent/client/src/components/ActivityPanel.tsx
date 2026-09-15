/**
 * 动态面板：屏幕活动时间线（GitHub 热力图风格）
 * - 每个点 = 10 分钟，深浅 = 观察记录条数（活跃度）
 * - 单击点查看时段明细，支持重命名/分类/标签
 * - 分类计数 + 时间线列表
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ActivityPeriod {
  id: number;
  start_ts: number;
  end_ts: number;
  name: string;
  category: string;
  tag: string | null;
  observation_count: number;
}

interface ActivitiesData {
  periods: ActivityPeriod[];
  counts: Record<string, number>;
}

const CATEGORIES = ['工作', '学习', '娱乐', '社交', '其他'] as const;
const SLOT_MS = 10 * 60 * 1000;

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function slotShade(count: number): string {
  if (count <= 0) return 'bg-black/20';
  if (count <= 2) return 'bg-[var(--color-accent)]/25';
  if (count <= 5) return 'bg-[var(--color-accent)]/50';
  if (count <= 9) return 'bg-[var(--color-accent)]/75';
  return 'bg-[var(--color-accent)]';
}

export function ActivityPanel(): React.JSX.Element {
  const [data, setData] = useState<ActivitiesData>({ periods: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ActivityPeriod | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string>('其他');
  const [editTag, setEditTag] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/activities');
      const json = (await res.json()) as { ok: boolean; data?: ActivitiesData };
      if (json.ok && json.data) setData(json.data);
    } catch { /* 静默 */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 今日 10 分钟槽位（0:00 起到当前）
  const slots = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const total = Math.min(144, Math.max(1, Math.ceil((now.getTime() - dayStart) / SLOT_MS)));
    const byStart = new Map<number, ActivityPeriod>();
    for (const p of data.periods) byStart.set(Math.floor(p.start_ts / SLOT_MS) * SLOT_MS, p);
    const out: { start: number; period: ActivityPeriod | null }[] = [];
    for (let i = 0; i < total; i++) {
      const start = dayStart + i * SLOT_MS;
      out.push({ start, period: byStart.get(start) ?? null });
    }
    return out;
  }, [data.periods]);

  const openDetail = (p: ActivityPeriod): void => {
    setSelected(p);
    setEditName(p.name);
    setEditCategory(p.category);
    setEditTag(p.tag ?? '');
  };

  const saveEdit = async (): Promise<void> => {
    if (!selected) return;
    setSaving(true);
    try {
      await fetch(`/api/v1/activities/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, category: editCategory, tag: editTag || null }),
      });
      setSelected(null);
      await load();
    } catch { /* 静默 */ }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-4 text-[var(--color-text-primary)]">
      {/* 分类计数 */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <span key={c} className="px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/10">
            {c} <b className="text-[var(--color-accent)]">{data.counts[c] ?? 0}</b>
          </span>
        ))}
        <button
          className="ml-auto px-2.5 py-1 rounded-full text-xs bg-white/10 border border-white/10 hover:bg-white/20"
          onClick={() => void load()}
        >
          刷新
        </button>
      </div>

      {/* 热力图：每个点 10 分钟 */}
      <div>
        <div className="text-xs opacity-60 mb-1.5">今日活动热力图（每格 10 分钟，越深越活跃）</div>
        {loading ? (
          <div className="text-sm opacity-50">加载中…</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {slots.map(({ start, period }) => (
              <button
                key={start}
                title={
                  period
                    ? `${fmtTime(period.start_ts)}-${fmtTime(period.end_ts)} ${period.name}（${period.category}）`
                    : `${fmtTime(start)} 无记录`
                }
                className={`w-4 h-4 rounded-sm ${slotShade(period?.observation_count ?? 0)} ${
                  period ? 'cursor-pointer hover:ring-1 hover:ring-white/60' : 'cursor-default'
                } ${selected?.start_ts === period?.start_ts ? 'ring-1 ring-white' : ''}`}
                onClick={() => { if (period) openDetail(period); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 时段明细编辑 */}
      {selected && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 flex flex-col gap-2">
          <div className="text-xs opacity-60">
            {fmtTime(selected.start_ts)} - {fmtTime(selected.end_ts)}
          </div>
          <input
            className="bg-white/10 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="活动/项目名"
          />
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`px-2 py-0.5 rounded-full text-xs ${
                  editCategory === c ? 'bg-[var(--color-accent)] text-white' : 'bg-white/10 hover:bg-white/20'
                }`}
                onClick={() => setEditCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            className="bg-white/10 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            value={editTag}
            onChange={(e) => setEditTag(e.target.value)}
            placeholder="自定义标签（可选）"
          />
          <div className="flex gap-2">
            <button
              className="px-3 py-1 rounded-lg text-sm bg-[var(--color-accent)] text-white disabled:opacity-50"
              disabled={saving}
              onClick={() => void saveEdit()}
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button className="px-3 py-1 rounded-lg text-sm bg-white/10 hover:bg-white/20" onClick={() => setSelected(null)}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* 时间线列表 */}
      <div>
        <div className="text-xs opacity-60 mb-1.5">时间线</div>
        <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
          {data.periods.length === 0 && <div className="text-sm opacity-50">今天还没有活动记录</div>}
          {[...data.periods].reverse().map((p) => (
            <button
              key={p.id}
              className="text-left flex items-center gap-2 rounded-lg px-2.5 py-1.5 bg-white/5 hover:bg-white/10"
              onClick={() => openDetail(p)}
            >
              <span className="text-xs opacity-60 shrink-0">{fmtTime(p.start_ts)}</span>
              <span className="text-sm truncate">{p.name}</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-white/10 shrink-0">{p.category}</span>
              {p.tag && <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent)]/30 shrink-0">#{p.tag}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
