/**
 * 模型选择面板
 * 展示可用 LLM 模型列表，支持切换
 */
import { useState, useEffect } from 'react';
import { api } from '../shared/utils/apiClient';

interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  isFree: boolean;
}

interface ModelListResponse {
  models: ModelInfo[];
  current: string;
}

export default function ModelSettings() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [current, setCurrent] = useState('');
  const [switching, setSwitching] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<ModelListResponse>('/models')
      .then((d) => {
        setModels(d.models);
        setCurrent(d.current);
      })
      .catch(() => setError('无法加载模型列表'));
  }, []);

  const selectModel = async (id: string) => {
    setSwitching(id);
    setError('');
    try {
      const d = await api.post<{ success: boolean; current: string; error?: string }>(
        '/models/select',
        { modelId: id },
      );
      if (d.success) setCurrent(d.current);
      else setError(d.error || '切换失败');
    } catch {
      setError('网络错误');
    } finally {
      setSwitching('');
    }
  };

  return (
    <div className="py-1">
      {models.map((m) => (
        <button
          key={m.id}
          onClick={() => selectModel(m.id)}
          disabled={switching === m.id}
          className={`w-full text-left px-3 py-2 flex items-center gap-2.5 text-sm transition-colors ${
            current === m.id
              ? 'bg-[var(--color-home-gold)]/10 text-[var(--color-home-gold)]'
              : 'text-gray-300 hover:bg-white/5'
          } disabled:opacity-50`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              current === m.id ? 'bg-[var(--color-home-gold)]' : 'bg-white/20'
            }`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate">{m.label}</span>
              {m.isFree && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 shrink-0">
                  免费
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">{m.provider}</div>
          </div>
          {switching === m.id && (
            <svg className="w-3.5 h-3.5 animate-spin shrink-0" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.3" />
              <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            </svg>
          )}
        </button>
      ))}
      {error && <div className="px-3 py-2 text-xs text-red-400">{error}</div>}

      {/* Token 用量与额度（管控成本） */}
      <UsageMeter />
    </div>
  );
}

/** Token 用量展示：今日/本月消耗 + 限额 + 超额状态 */
function UsageMeter() {
  const [stats, setStats] = useState<{
    daily: { used: number; limit: number; remaining: number };
    monthly: { used: number; limit: number; remaining: number };
    allowed: boolean;
  } | null>(null);

  useEffect(() => {
    api.get<{ stats: typeof stats }>('/usage')
      .then((d) => setStats(d.stats))
      .catch(() => { /* 静默：服务端未实现时不打扰用户 */ });
  }, []);

  if (!stats) return null;

  const fmt = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : n.toLocaleString();
  const pct = (used: number, limit: number) => Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <div className="mt-3 px-3 py-2.5 rounded-lg bg-white/3 border border-white/5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-gray-400">Token 用量</span>
        {!stats.allowed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400">已超额</span>
        )}
      </div>

      <div className="space-y-2">
        {([
          { label: '今日', ...stats.daily },
          { label: '本月', ...stats.monthly },
        ]).map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-[11px] text-gray-500 mb-0.5">
              <span>{row.label}</span>
              <span>
                {fmt(row.used)} / {fmt(row.limit)} Token
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${pct(row.used, row.limit) >= 90 ? 'bg-red-400' : 'bg-[var(--color-home-gold)]'}`}
                style={{ width: `${pct(row.used, row.limit)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-gray-600 mt-1.5">
        额度可在服务端 .env 配置（TOKEN_DAILY_LIMIT / TOKEN_MONTHLY_LIMIT）
      </div>
    </div>
  );
}
