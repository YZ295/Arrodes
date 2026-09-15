/**
 * 人物卡面板（sidebar「画像」视图）
 *
 * 三块内容：
 * 1. 阿罗德斯身份卡 —— 守灯人 + 四戒（与 SYSTEM_PROMPT 人设一致）
 * 2. 行为准则卡 —— 愚者大人设定的「世界级专家」行为规范（可一键复制）
 * 3. 记忆中的人物 —— 后端 extractPersonEntities 识别的人物实体，点击可跳记忆库搜索
 */
import { useState, useEffect, useCallback } from 'react';
import Avatar from './Avatar';
import { eventBus, EVENTS } from '../shared/events/EventBus';
import {
  BEHAVIOR_GUIDELINES,
  BEHAVIOR_GUIDELINES_FULL_TEXT,
  BEHAVIOR_GUIDELINES_TITLE,
} from '../constants/behaviorGuidelines';
import type { SidebarView } from './Sidebar';

/* ============================================================
 * 身份卡字段（与 llmService SYSTEM_PROMPT 四戒人设对齐）
 * ============================================================ */
const IDENTITY_FIELDS: Array<{ label: string; value: string }> = [
  { label: '身份', value: '愚者的守灯人与谏臣' },
  { label: '定位', value: '同行者——不是仆人也不是老师，有想法直说，有风险直谏' },
  { label: '四戒', value: '求真（不编造）· 记忆（不忘托付）· 主动（到点提醒）· 诤言（先亮判断）' },
  { label: '自称', value: '阿罗德斯（称呼用户为「愚者大人」）' },
  { label: '语风', value: '现代口语，简短直接，不拽文言，不堆金句' },
];

/* ============================================================
 * 人物卡主组件
 * ============================================================ */
interface ProfilePanelProps {
  /** 跳转到其他视图（点击人物 → 记忆库搜索） */
  onNavigate?: (view: SidebarView) => void;
}

export default function ProfilePanel({ onNavigate }: ProfilePanelProps) {
  const [persons, setPersons] = useState<Array<{ name: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState('');

  // 更换头像：读入图片存为 data URL（localStorage），Avatar 组件自动生效
  const changeAvatar = useCallback((file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        localStorage.setItem('arrodes.avatar', String(reader.result));
        setAvatarMsg('✓ 头像已更新');
        setTimeout(() => setAvatarMsg(''), 2000);
      } catch {
        setAvatarMsg('保存失败（图片过大？）');
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const resetAvatar = useCallback(() => {
    try {
      localStorage.removeItem('arrodes.avatar');
    } catch {
      // ignore
    }
    setAvatarMsg('已恢复默认头像');
    setTimeout(() => setAvatarMsg(''), 2000);
  }, []);

  // 加载记忆中的人物（persons 由后端 extractPersonEntities 识别，count 由前端统计出现次数）
  const loadPersons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/memories');
      if (!res.ok) throw new Error(`加载失败: ${res.status}`);
      const data = await res.json();
      const memories: Array<{ content: string }> = data.memories || [];
      const names: string[] = data.persons || [];
      setPersons(
        names
          .map((name) => ({
            name,
            count: memories.filter((m) => m.content.includes(name)).length,
          }))
          .sort((a, b) => b.count - a.count),
      );
    } catch {
      setPersons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPersons();
  }, [loadPersons]);

  // 复制全文
  const copyGuidelines = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(BEHAVIOR_GUIDELINES_FULL_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默
    }
  }, []);

  // 点击人物 → 跳记忆库并搜索该人物
  const searchPerson = useCallback((name: string) => {
    eventBus.emit(EVENTS.MEMORY_SEARCH_REQUEST, { query: name });
    onNavigate?.('memory');
  }, [onNavigate]);

  return (
    <div className="p-5 space-y-5">
      {/* ============ ① 阿罗德斯身份卡 ============ */}
      <div className="flex flex-col items-center text-center">
        <Avatar size={96} showHalo glow />
        <h2 className="mt-3 text-xl font-semibold text-white/90">阿罗德斯</h2>
        <p className="text-sm text-white/30 mt-1">虚空之镜 · 命运之音 · 守灯人</p>
        <div className="flex items-center gap-2 mt-2.5">
          <label className="text-[16px] px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/20 cursor-pointer hover:bg-blue-500/25 transition-colors">
            更换头像
            <input type="file" accept="image/*" className="hidden" onChange={(e) => changeAvatar(e.target.files?.[0])} />
          </label>
          <button
            onClick={resetAvatar}
            className="text-[16px] px-2.5 py-1 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 transition-colors"
          >
            重置
          </button>
        </div>
        {avatarMsg && <p className="mt-1.5 text-[16px] text-blue-300/80">{avatarMsg}</p>}
      </div>

      <div className="space-y-3">
        {IDENTITY_FIELDS.map((f) => (
          <ProfileField key={f.label} label={f.label} value={f.value} />
        ))}
      </div>

      {/* ============ ② 行为准则卡 ============ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[16px] text-white/30 uppercase tracking-wider">行为准则</h3>
          <button
            onClick={copyGuidelines}
            className={`text-[16px] px-2 py-0.5 rounded transition-colors ${
              copied
                ? 'bg-green-500/20 text-green-400'
                : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/80'
            }`}
            title="复制准则全文"
          >
            {copied ? '✓ 已复制' : '复制全文'}
          </button>
        </div>

        <div className="rounded-xl border border-blue-400/15 bg-blue-400/3 overflow-hidden">
          <div className="px-4 py-2 bg-blue-400/8 border-b border-blue-400/10 text-sm text-blue-300/90 flex items-center gap-1.5">
            <span className="text-[16px]">⚜️</span>
            {BEHAVIOR_GUIDELINES_TITLE}
            <span className="ml-auto text-[16px] text-blue-300/40">愚者大人设定</span>
          </div>
          <div className="p-3 space-y-2.5 max-h-72 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
            {BEHAVIOR_GUIDELINES.map((group) => (
              <div key={group.key}>
                <div className="text-[16px] text-blue-300/70 mb-1">▍{group.title}</div>
                <ul className="space-y-1">
                  {group.rules.map((rule, i) => (
                    <li key={i} className="text-sm text-white/55 leading-relaxed pl-3">
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ ③ 记忆中的人物 ============ */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[16px] text-white/30 uppercase tracking-wider">
            👤 记忆中的人物
          </h3>
          <span className="text-[16px] text-white/25">{loading ? '加载中…' : `${persons.length} 人`}</span>
        </div>

        {!loading && persons.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-white/3 px-4 py-6 text-center">
            <p className="text-sm text-white/30">暂无识别到的人物</p>
            <p className="text-[16px] text-white/20 mt-1">对话中提到人名后会自动出现在这里</p>
          </div>
        ) : (
          <div className="space-y-2">
            {persons.map((p) => (
              <button
                key={p.name}
                onClick={() => searchPerson(p.name)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/3 border border-white/5
                  hover:border-[var(--color-home-gold)]/30 hover:bg-white/5 transition-all text-left group"
                title={`点击搜索与「${p.name}」相关的记忆`}
              >
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400/70 to-blue-700/70
                  flex items-center justify-center text-[16px] font-bold text-white shrink-0">
                  {p.name[0]}
                </span>
                <span className="text-sm text-white/80 group-hover:text-white transition-colors flex-1 min-w-0 truncate">
                  {p.name}
                </span>
                <span className="text-[16px] text-white/30 shrink-0">{p.count} 条记忆</span>
                <svg className="w-3 h-3 text-white/20 group-hover:text-blue-300/60 shrink-0 transition-colors"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * 字段行
 * ============================================================ */
function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/3 rounded-lg px-4 py-2.5 border border-white/5">
      <div className="text-[16px] text-white/25 uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm text-white/60 leading-relaxed">{value}</div>
    </div>
  );
}
