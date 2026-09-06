/**
 * ModelSelect：输入栏模型选择器（参照 DeepSeek Harness ModelSelect）
 *
 * 触发 chip 显示当前模型；菜单按 Provider 分组列出全部模型，
 * 选中项右侧打勾；切换调用 POST /api/v1/models/select（全局生效）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../shared/utils/apiClient';
import ComposerMenu from './ComposerMenu';

interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  isFree?: boolean;
  description?: string;
}

interface ModelsResponse {
  models: ModelInfo[];
  current: string;
}

interface ModelSelectProps {
  disabled?: boolean;
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3 h-3 text-white/40 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 12 12" fill="none" aria-hidden
    >
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ModelSelect({ disabled }: ModelSelectProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [current, setCurrent] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<ModelsResponse>('/models');
      setModels(data.models);
      setCurrent(data.current);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '模型列表加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const select = async (id: string) => {
    if (id === current || busy) return;
    setBusy(true);
    try {
      const data = await api.post<{ current: string }>('/models/select', { modelId: id });
      setCurrent(data.current);
      setOpen(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换失败');
    } finally {
      setBusy(false);
    }
  };

  const groups = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const m of models) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return Array.from(map.entries());
  }, [models]);

  const currentModel = models.find((m) => m.id === current);
  const label = currentModel?.label ?? (error ? '模型加载失败' : '选择模型');

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      align="right"
      widthClass="w-72"
      trigger={(isOpen) => (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((p) => !p)}
          title="切换模型"
          className="h-8 px-2.5 rounded-full text-[13px] font-medium text-white/60
            hover:bg-white/10 hover:text-white/90 transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40"
        >
          <svg className="w-3.5 h-3.5 text-white/45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
          <span className="max-w-[150px] truncate">{label}</span>
          <ChevronDown open={isOpen} />
        </button>
      )}
    >
      {error && (
        <div className="px-2.5 py-2 text-[12px] text-red-400/90">{error}</div>
      )}
      {groups.length === 0 && !error && (
        <div className="px-2.5 py-2 text-[12px] text-white/35">加载中…</div>
      )}
      {groups.map(([provider, list]) => (
        <div key={provider} className="mb-0.5">
          <div className="px-2.5 pt-2 pb-1 text-[11px] text-white/35 font-medium">{provider}</div>
          {list.map((m) => {
            const selected = m.id === current;
            return (
              <button
                key={m.id}
                type="button"
                disabled={busy}
                onClick={() => void select(m.id)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                  selected ? 'text-white' : 'text-white/80 hover:bg-white/8'
                } disabled:opacity-60`}
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{m.label}</span>
                  {m.description && (
                    <span className="block truncate text-[11px] text-white/35">{m.description}</span>
                  )}
                </span>
                {selected && (
                  <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </ComposerMenu>
  );
}
