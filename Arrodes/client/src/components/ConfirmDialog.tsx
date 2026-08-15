/**
 * 高风险操作确认弹窗
 *
 * 视觉语言：与全局「深空 + 玻璃 + 金色」一致——深蓝玻璃底、金色描边与光晕、
 * 盾形图标、金色主按钮，避免普通暗色弹窗的廉价感。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Message } from '@shared/types';
import { api } from '../shared/utils/apiClient';

interface PendingAction {
  id: string;
  skill: string;
  description: string;
  args: Record<string, unknown>;
  risk: 'low' | 'high';
  createdAt: number;
}

interface ConfirmDialogProps {
  messages: Message[];
  onAppendAssistant: (content: string) => void;
}

export default function ConfirmDialog({ messages, onAppendAssistant }: ConfirmDialogProps) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const handled = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ pending: PendingAction[] }>('/actions/pending');
      const list = data.pending ?? [];
      const latest = list[list.length - 1] ?? null;
      if (latest && !handled.current.has(latest.id)) {
        setPending(latest);
      } else if (!latest) {
        setPending(null);
      }
    } catch {
      // 无待确认项或接口暂不可用时静默
    }
  }, []);

  const lastMessageId = messages[messages.length - 1]?.id;
  const lastMessageLen = messages[messages.length - 1]?.content.length;
  useEffect(() => {
    refresh();
  }, [lastMessageId, lastMessageLen, refresh]);

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const data = await api.post<{ result: string }>(`/actions/${pending.id}/confirm`);
      handled.current.add(pending.id);
      setPending(null);
      onAppendAssistant(data.result || '已执行');
    } catch (err) {
      onAppendAssistant(`确认失败: ${err instanceof Error ? err.message : String(err)}`);
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await api.post(`/actions/${pending.id}/cancel`);
      handled.current.add(pending.id);
      setPending(null);
      onAppendAssistant('已取消该操作。');
    } catch {
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#02040a]/60 backdrop-blur-md px-4 animate-fade-in">
      <div className="w-full max-w-[420px] rounded-2xl overflow-hidden border border-blue-400/25 bg-[#0b1022]/90 backdrop-blur-xl shadow-[0_24px_80px_-28px_rgba(59,130,246,0.45)]">
        {/* 顶部金色光带 */}
        <div className="h-0.5 bg-gradient-to-r from-transparent via-blue-400/80 to-transparent" />

        <div className="p-6">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400/20 to-blue-600/10 border border-blue-400/30 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(59,130,246,0.55)]">
              <svg className="w-5 h-5 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 2l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V5l7-3z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9.5 12l1.8 1.8 3.4-3.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-blue-200/95">需要你的确认</h3>
              <p className="text-[13px] text-white/35 mt-0.5">高风险操作 · 确认后才会执行</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3.5">
            <p className="text-[15px] text-white/85 leading-relaxed break-words">{pending.description}</p>
          </div>

          <div className="mt-5 flex justify-end gap-2.5">
            <button
              onClick={cancel}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-[14px] text-white/60 hover:text-white/90 bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
            >
              取消
            </button>
            <button
              onClick={confirm}
              disabled={busy}
              className="px-5 py-2 rounded-lg text-[14px] font-medium text-white bg-gradient-to-br from-blue-400 to-blue-600 hover:from-blue-300 hover:to-blue-500 shadow-[0_8px_24px_-8px_rgba(59,130,246,0.75)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? '执行中…' : '确认执行'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
