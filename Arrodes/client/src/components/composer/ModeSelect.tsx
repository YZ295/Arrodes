/**
 * ModeSelect：技能模式选择器（参照 DeepSeek Harness 的 Agent Preset 选择器）
 *
 * 四套模式（标准 / PTC / 创造 / 极简）对应阿罗德斯技能组合的运行时切换，
 * 调用 POST /api/v1/modes/select 即时生效。
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../shared/utils/apiClient';
import ComposerMenu from './ComposerMenu';

interface SkillMode {
  id: string;
  name: string;
  description: string;
  disabledCount: number;
}

interface ModesResponse {
  modes: SkillMode[];
  current: string;
}

interface ModeSelectProps {
  disabled?: boolean;
}

export default function ModeSelect({ disabled }: ModeSelectProps) {
  const [modes, setModes] = useState<SkillMode[]>([]);
  const [current, setCurrent] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<ModesResponse>('/modes');
      setModes(data.modes);
      setCurrent(data.current);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '模式列表加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const select = async (id: string) => {
    if (id === current || busy) return;
    setBusy(true);
    try {
      const data = await api.post<{ current: string }>('/modes/select', { modeId: id });
      setCurrent(data.current);
      setOpen(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换失败');
    } finally {
      setBusy(false);
    }
  };

  const currentMode = modes.find((m) => m.id === current);
  const label = currentMode?.name ?? (error ? '模式加载失败' : '模式');

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      widthClass="w-72"
      trigger={(isOpen) => (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((p) => !p)}
          title="切换技能模式"
          className="h-8 px-2.5 rounded-full text-[13px] font-medium text-white/60
            hover:bg-white/10 hover:text-white/90 transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40"
        >
          <svg className="w-3.5 h-3.5 text-white/45" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75h15M4.5 12h15m-15 5.25h15" />
          </svg>
          <span className="whitespace-nowrap">{label}</span>
          <svg
            className={`w-3 h-3 text-white/40 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 12 12" fill="none" aria-hidden
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    >
      {error && (
        <div className="px-2.5 py-2 text-[12px] text-red-400/90">{error}</div>
      )}
      {modes.map((m) => {
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
              <span className="block">{m.name}</span>
              <span className="block text-[11px] text-white/35 leading-snug">{m.description}</span>
            </span>
            {selected && (
              <svg className="w-4 h-4 text-blue-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        );
      })}
    </ComposerMenu>
  );
}
