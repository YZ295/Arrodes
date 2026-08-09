/**
 * 会话列表面板（左侧常驻，可随侧栏联动折叠）
 * 借鉴主流桌面 Agent（Codex / ChatGPT / Hermes）：
 * - 顶部搜索框：按标题/内容过滤会话
 * - 会话操作：新建 / 切换 / 重命名 / 删除
 * - 折叠态：宽度收为 0（纯图标导航模式），展开动画平滑
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SessionNode } from '@shared/types';
import { eventBus, EVENTS } from '../shared/events/EventBus';
import { api } from '../shared/utils/apiClient';
import { useWorkspaceStore } from '../store/workspaceStore';

interface SessionPanelProps {
  /** 当前会话 ID（高亮） */
  currentSessionId: string | null;
  /** 是否折叠（与图标侧栏联动） */
  collapsed?: boolean;
}

export default function SessionPanel({ currentSessionId, collapsed = false }: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionNode[]>([]);
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [deleting, setDeleting] = useState('');
  const [search, setSearch] = useState('');
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const load = useCallback(() => {
    api.get<{ sessions: SessionNode[] }>(`/sessions?ws=${encodeURIComponent(activeWorkspaceId)}`).then((d) => {
      setSessions(d.sessions || []);
    });
  }, [activeWorkspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  // 搜索过滤（标题 + 摘要）
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || (s.topic || '').toLowerCase().includes(q),
    );
  }, [sessions, search]);

  const switchSession = (id: string) => {
    eventBus.emit(EVENTS.VOICE_SESSION_SWITCH, { sessionId: id });
  };

  const createNew = () => {
    eventBus.emit(EVENTS.VOICE_SESSION_CREATE, { title: '新对话', topic: 'other' });
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await api.delete(`/sessions/${id}`);
      load();
      // 删除的是当前会话 → 切到剩余第一个或触发新建
      if (id === currentSessionId) {
        const rest = sessions.filter((s) => s.id !== id);
        if (rest.length > 0) {
          eventBus.emit(EVENTS.VOICE_SESSION_SWITCH, { sessionId: rest[0].id });
        } else {
          eventBus.emit(EVENTS.VOICE_SESSION_CREATE, { title: '新对话', topic: 'other' });
        }
      }
    } catch {
      // 静默处理
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
    if (!t) {
      setEditingId('');
      return;
    }
    try {
      await api.patch(`/sessions/${id}`, { title: t });
      load();
    } catch {
      // 静默处理
    }
    setEditingId('');
  };

  return (
    <div
      className={`h-full bg-black/40 backdrop-blur-xl border-r border-white/5 flex flex-col
        transition-[width,opacity] duration-300 ease-in-out overflow-hidden ${
        collapsed ? 'w-0 opacity-0 border-r-0' : 'w-64 opacity-100'
      }`}
    >
      {/* 标题栏：搜索 + 新建 */}
      <div className="flex flex-col gap-2 px-3 pt-3 pb-2 border-b border-white/5 shrink-0">
        {/* 搜索框 */}
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
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

        {/* 新建按钮行 */}
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-semibold uppercase tracking-wider text-white/30">
            会话 {filtered.length > 0 ? `(${filtered.length})` : ''}
          </span>
          <button
            onClick={createNew}
            className="flex items-center gap-1 text-[16px] text-gray-400 hover:text-[var(--color-home-gold)]/70 transition-colors"
            title="新建会话"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            新建
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {filtered.map((s) => (
          <div
            key={s.id}
            onClick={() => switchSession(s.id)}
            className={`flex items-center gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer
              transition-colors group text-sm ${
                currentSessionId === s.id ? 'bg-white/10 text-white' : 'hover:bg-white/5 text-gray-300'
              }`}
          >
            {/* 选中指示 */}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                currentSessionId === s.id ? 'bg-amber-400' : 'bg-white/15'
              }`}
            />

            {/* 标题（可编辑） */}
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

            {/* 操作按钮（hover 显示） */}
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => startRename(s.id, s.title, e)}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-white/10 text-gray-400 hover:text-white"
                title="重命名"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={(e) => remove(s.id, e)}
                disabled={deleting === s.id}
                className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-500/20 text-gray-400 hover:text-red-400"
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
          <div className="text-center text-gray-500 text-[16px] py-8">
            {search ? '无匹配会话' : '暂无会话，点击"新建"开始'}
          </div>
        )}
      </div>
    </div>
  );
}
