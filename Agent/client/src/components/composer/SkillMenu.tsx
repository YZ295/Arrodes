/**
 * SkillMenu：输入栏「＋」技能选择器（参照 DeepSeek Harness 的 + 命令菜单）
 *
 * 列出当前启用的技能；点选/取消附加到本次消息（呈现在输入栏上方 chip），
 * 发送时由 ChatOverlay 拼进消息正文。risk 徽标区分低/高风险。
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../shared/utils/apiClient';
import ComposerMenu from './ComposerMenu';

interface SkillInfo {
  name: string;
  description: string;
  risk: 'low' | 'high';
  readOnly: boolean;
  enabled: boolean;
}

interface SkillsResponse {
  skills: SkillInfo[];
}

interface SkillMenuProps {
  attached: string[];
  onToggle: (name: string) => void;
  disabled?: boolean;
}

export default function SkillMenu({ attached, onToggle, disabled }: SkillMenuProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<SkillsResponse>('/skills');
      setSkills(data.skills.filter((s) => s.enabled));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '技能列表加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      widthClass="w-80"
      trigger={(isOpen) => (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((p) => !p)}
          title="选择技能"
          aria-label="选择技能"
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-150 disabled:opacity-40 ${
            open || attached.length > 0
              ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30'
              : 'bg-white/8 text-white/75 hover:bg-white/15 hover:text-white'
          }`}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-150 ${isOpen ? 'rotate-45' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      )}
    >
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-white/35 font-medium">附加技能（随本条消息发送）</div>
      {error && (
        <div className="px-2.5 py-2 text-[12px] text-red-400/90">{error}</div>
      )}
      {skills.length === 0 && !error && (
        <div className="px-2.5 py-2 text-[12px] text-white/35">加载中…</div>
      )}
      {skills.map((s) => {
        const selected = attached.includes(s.name);
        return (
          <button
            key={s.name}
            type="button"
            onClick={() => onToggle(s.name)}
            className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
              selected ? 'text-white bg-blue-500/10' : 'text-white/80 hover:bg-white/8'
            }`}
          >
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium">{s.name}</span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-px text-[10px] leading-4 ${
                    s.risk === 'high' ? 'bg-red-500/15 text-red-300' : 'bg-white/8 text-white/40'
                  }`}
                >
                  {s.risk === 'high' ? '高' : '低'}
                </span>
                {s.readOnly && <span className="shrink-0 text-[10px] text-white/30">只读</span>}
              </span>
              <span className="block truncate text-[11px] text-white/35">{s.description}</span>
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
