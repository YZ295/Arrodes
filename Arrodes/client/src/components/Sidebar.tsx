/**
 * 一体化左侧栏：功能导航 + 会话列表（借鉴主流桌面 Agent：Codex / ChatGPT / Hermes）
 *
 * 结构（展开态）：
 * ┌──────────────────────┐
 * │ 🔮 阿罗德斯           │  ← Logo + 折叠按钮
 * ├──────────────────────┤
 * │ [搜索会话...]         │
 * │ [📌 会话] [🗂 归档]   │  ← 标签切换
 * │ 会话列表              │
 * │  · 新建按钮           │
 * ├──────────────────────┤
 * │ 图标导航（功能入口）    │  ← 仅显示当前可用功能
 * └──────────────────────┘
 *
 * 折叠态：只显示图标导航（宽 14），会话区隐藏。
 * 归档：软删除（数据保留，仅从列表隐藏）；过期会话自动回收。
 */
import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import type { SessionNode } from '@shared/types';
import { eventBus, EVENTS } from '../shared/events/EventBus';
import { api } from '../shared/utils/apiClient';
import { useWorkspaceStore } from '../store/workspaceStore';

export type SidebarView =
  | 'conversation' | 'workspace' | 'canvas' | 'workflow' | 'profile' | 'memory'
  | 'vision' | 'skills' | 'settings' | 'mobile' | 'advanced' | 'wallpaper' | 'activity';

interface NavItem {
  id: SidebarView;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'conversation', label: '对话', icon: 'conversation' },
  { id: 'workspace', label: '工作区', icon: 'workspace' },
  { id: 'wallpaper', label: '壁纸', icon: 'wallpaper' },
  { id: 'skills', label: '技能', icon: 'skills' },
  { id: 'profile', label: '画像', icon: 'profile' },
  { id: 'memory', label: '记忆', icon: 'memory' },
  { id: 'vision', label: '视觉', icon: 'vision' },
  { id: 'activity', label: '动态', icon: 'activity' },
  { id: 'settings', label: '配置', icon: 'settings' },
  { id: 'advanced', label: '高级', icon: 'advanced' },
];

function NavIcon({ id }: { id: SidebarView }) {
  const props = {
    className: 'w-5 h-5',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (id) {
    case 'conversation':
      return (
        <svg {...props}>
          <path d="M21 11.5a8.5 8.5 0 01-8.5 8.5H5l-2.5 2V15A8.5 8.5 0 0111 3h1.5A8.5 8.5 0 0121 11.5z" />
        </svg>
      );
    case 'workspace':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(-22 12 12)" />
        </svg>
      );
    case 'canvas':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'wallpaper':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8.5" cy="10" r="1.5" />
          <path d="M21 15l-5-5-7 7" />
        </svg>
      );
    case 'skills':
      return (
        <svg {...props}>
          <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        </svg>
      );
    case 'workflow':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="6" height="6" rx="1.5" />
          <rect x="15" y="15" width="6" height="6" rx="1.5" />
          <path d="M6 9v3a3 3 0 003 3h6" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5" />
        </svg>
      );
    case 'memory':
      return (
        <svg {...props}>
          <path d="M12 3a4 4 0 014 4v1a4 4 0 014 4v3a4 4 0 01-4 4H8a5 5 0 01-5-5v-2a5 5 0 015-5h1a4 4 0 014-4z" />
        </svg>
      );
    case 'vision':
      return (
        <svg {...props}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'activity':
      return (
        <svg {...props}>
          <rect x="3" y="12" width="3" height="3" rx="0.5" />
          <rect x="8" y="9" width="3" height="6" rx="0.5" />
          <rect x="13" y="5" width="3" height="10" rx="0.5" />
          <rect x="18" y="12" width="3" height="3" rx="0.5" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      );
    case 'mobile':
      return (
        <svg {...props}>
          <rect x="7" y="2" width="10" height="20" rx="2.5" />
          <path d="M11 18h2" />
        </svg>
      );
    case 'advanced':
      return (
        <svg {...props}>
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" />
        </svg>
      );
    default:
      return null;
  }
}

interface SidebarProps {
  currentView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  collapsed: boolean;
  onToggle: () => void;
  currentSessionId: string | null;
  isConnected: boolean;
  overlay?: boolean;
}

export default memo(function Sidebar({ currentView, onViewChange, collapsed, onToggle, currentSessionId, overlay }: SidebarProps) {
  const [sessions, setSessions] = useState<SessionNode[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [deleting, setDeleting] = useState('');
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const load = useCallback(() => {
    api
      .get<{ sessions: SessionNode[] }>(`/sessions?ws=${encodeURIComponent(activeWorkspaceId)}&archived=${showArchived ? 1 : 0}`)
      .then((d) => setSessions(d.sessions || []));
  }, [activeWorkspaceId, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  // 搜索过滤
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, search]);

  const switchSession = (id: string) => {
    eventBus.emit(EVENTS.VOICE_SESSION_SWITCH, { sessionId: id });
  };

  const createNew = () => {
    eventBus.emit(EVENTS.VOICE_SESSION_CREATE, { title: '新对话', topic: 'other' });
  };

  const toggleArchive = async (s: SessionNode, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (s.archived) {
        // T11 一键恢复：恢复后回到会话标签并切换高亮
        await api.post(`/sessions/${s.id}/unarchive`, {});
        setShowArchived(false);
        load();
        switchSession(s.id);
      } else {
        await api.post(`/sessions/${s.id}/archive`, {});
        load();
      }
    } catch {
      // 静默
    }
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await api.delete(`/sessions/${id}`);
      load();
      if (id === currentSessionId) {
        const rest = sessions.filter((s) => s.id !== id);
        if (rest.length > 0) switchSession(rest[0].id);
        else createNew();
      }
    } catch {
      // 静默
    } finally {
      setDeleting('');
    }
  };

  const startRename = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(title);
  };

  const confirmRename = async (id: string) => {
    const t = editTitle.trim();
    if (!t) { setEditingId(''); return; }
    try { await api.patch(`/sessions/${id}`, { title: t }); load(); } catch { /* 静默 */ }
    setEditingId('');
  };

  return (
    <aside aria-label="主导航" className={`arrodes-sidebar ${overlay ? 'absolute inset-y-0 left-0 z-50 shadow-2xl' : 'relative z-40'} h-full shrink-0 transition-[width] duration-200 ${
      collapsed ? 'w-[68px]' : 'w-[272px]'
    } bg-[color:var(--color-bg-nav)]/95 backdrop-blur-xl border-r border-[var(--color-border)] flex flex-col`}>
      {/* 折叠按钮 */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-50 w-6 h-6 rounded-full bg-black/60 border border-white/10
          flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
        title={collapsed ? '展开' : '折叠'}
      >
        <svg className={`w-3 h-3 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Logo / 标题 */}
      <div className="px-4 py-5 flex items-center gap-2 overflow-hidden shrink-0">
        <div className="w-8 h-8 rounded-[10px] bg-blue-500/15 border border-blue-400/25
          flex items-center justify-center shrink-0 text-blue-300 font-semibold">
          A
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-[16px] font-semibold text-white/90 truncate">阿罗德斯</span>
            <span className="text-xs text-[var(--color-text-muted)] truncate">虚空之镜</span>
          </div>
        )}
      </div>

      {/* 功能导航（图标，始终显示） */}
      <nav className={`flex flex-col gap-0.5 px-2 overflow-y-auto min-h-0 ${
        collapsed ? 'pt-2' : ''
      }`}>
      {NAV_ITEMS.map((item) => {
          const active = currentView === item.id || (item.id === 'workspace' && currentView === 'canvas');
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              className={`group relative flex items-center gap-3 rounded-lg transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              } ${
                active
                  ? 'bg-white/10 text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-white hover:bg-white/5'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-blue-400" />
              )}
              <span className={`w-5 h-5 shrink-0 flex items-center justify-center transition-colors ${
                active ? 'text-blue-400' : ''
              }`}>
                <NavIcon id={item.id} />
              </span>
              {!collapsed && (
                <span className="text-sm font-medium truncate flex-1 text-left">{item.label}</span>
              )}
            </button>
          );
        })}
      </nav>


      {/* 会话区（展开态显示） */}
      {!collapsed && (
        <div className="flex flex-col min-h-0 flex-1 border-t border-white/5">
          {/* 搜索 + 标签 */}
          <div className="flex flex-col gap-1.5 px-3 pt-2.5 pb-1.5 shrink-0">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索会话..."
                className="w-full bg-white/5 rounded-lg pl-7 pr-2 py-1.5 text-[16px] text-white/80
                  placeholder-white/25 outline-none border border-transparent
                  focus:border-white/20 focus:bg-white/8 transition-all"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowArchived(false)}
                className={`flex-1 text-[16px] py-1 rounded-md transition-colors ${
                  !showArchived ? 'bg-white/10 text-white/80' : 'text-white/30 hover:text-white/60'
                }`}
              >
                会话
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`flex-1 text-[16px] py-1 rounded-md transition-colors ${
                  showArchived ? 'bg-white/10 text-white/80' : 'text-white/30 hover:text-white/60'
                }`}
              >
                归档
              </button>
            </div>
          </div>

          {/* 会话列表 */}
          <div className="flex-1 overflow-y-auto py-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.15)_transparent]">
            {filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => switchSession(s.id)}
                className={`flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer
                  transition-colors group text-sm ${
                    currentSessionId === s.id && !showArchived
                      ? 'bg-white/10 text-white'
                      : 'hover:bg-white/5 text-gray-300'
                  }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  currentSessionId === s.id && !showArchived ? 'bg-blue-400' : 'bg-white/15'
                }`} />
                <div className="flex-1 min-w-0" onDoubleClick={(e) => startRename(s.id, s.title, e)}>
                  {editingId === s.id ? (
                    <input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => confirmRename(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRename(s.id);
                        if (e.key === 'Escape') setEditingId('');
                        e.stopPropagation();
                      }}
                      className="w-full bg-white/10 rounded px-1.5 py-0.5 text-sm outline-none border border-white/20"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="truncate block">{s.title}</span>
                  )}
                </div>
                <span className="text-[16px] text-gray-500 shrink-0">{s.messageCount}</span>
                <div className={`flex gap-0.5 ${showArchived ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                  {/* 归档/恢复（T11：归档视图下恢复按钮常显并高亮） */}
                  <button
                    onClick={(e) => toggleArchive(s, e)}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                      s.archived
                        ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/40'
                        : 'hover:bg-white/10 text-gray-400 hover:text-blue-300'
                    }`}
                    title={s.archived ? '一键恢复（回到会话）' : '归档'}
                  >
                    {s.archived ? (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 8v13H3V8M1 3h22v5H1z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  {/* 删除 */}
                  <button
                    onClick={(e) => remove(s.id, e)}
                    disabled={deleting === s.id}
                    className="w-5 h-5 rounded flex items-center justify-center text-red-300/70 hover:bg-red-500/20 hover:text-red-300"
                    title="删除"
                  >
                    {deleting === s.id ? (
                      <span className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center text-gray-500 text-[16px] py-6">
                {search ? '无匹配会话' : showArchived ? '暂无归档会话' : '暂无会话'}
              </div>
            )}
          </div>

          {/* 新建按钮 */}
          <div className="px-3 py-2 border-t border-white/5 shrink-0">
            <button
              onClick={createNew}
              className="w-full flex items-center justify-center gap-1.5 text-[16px] py-1.5 rounded-lg
                bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              新建会话
            </button>
          </div>
        </div>
      )}
    </aside>
  );
});
