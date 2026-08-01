/**
 * 会话列表面板
 * 展示所有会话、支持切换/新建/重命名/删除
 */
import { useState, useEffect } from 'react';
import type { SessionNode } from '@shared/types';
import { eventBus, EVENTS } from '../shared/events/EventBus';
import { api } from '../shared/utils/apiClient';

interface SessionPanelProps {
  onClose: () => void;
}

export default function SessionPanel({ onClose }: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionNode[]>([]);
  const [currentId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [deleting, setDeleting] = useState('');

  const load = () => {
    api.get<{ sessions: SessionNode[] }>('/sessions').then((d) => {
      setSessions(d.sessions || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const switchSession = (id: string) => {
    eventBus.emit(EVENTS.VOICE_SESSION_SWITCH, { sessionId: id });
    onClose();
  };

  const createNew = async () => {
    eventBus.emit(EVENTS.VOICE_SESSION_CREATE, { title: '新对话', topic: 'other' });
    onClose();
  };

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await api.delete(`/sessions/${id}`);
      eventBus.emit(EVENTS.UNIVERSE_PLANET_CLICK as never, { sessionId: 'home' });
      load();
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
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-sm font-medium">会话列表</span>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">
          &times;
        </button>
      </div>

      {/* 新会话按钮 */}
      <button
        onClick={createNew}
        className="mx-3 mt-2 py-2 rounded-lg border border-dashed border-white/15 text-sm text-gray-400
          hover:border-[var(--color-home-gold)]/40 hover:text-[var(--color-home-gold)]/70 transition-colors"
      >
        + 新建会话
      </button>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => switchSession(s.id)}
            className="flex items-center gap-2 px-3 py-2.5 mx-1 rounded-lg cursor-pointer
              hover:bg-white/5 transition-colors group text-sm"
          >
            {/* 选中指示 */}
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                currentId === s.id ? 'bg-[var(--color-home-gold)]' : 'bg-white/15'
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
                <span className="truncate block text-gray-200">{s.title}</span>
              )}
            </div>

            <span className="text-[10px] text-gray-500 shrink-0">{s.messageCount}条</span>

            {/* 操作按钮（hover 显示） */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        {sessions.length === 0 && (
          <div className="text-center text-gray-500 text-xs py-8">暂无会话</div>
        )}
      </div>
    </div>
  );
}
