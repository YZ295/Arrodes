/**
 * 高风险操作确认弹窗
 *
 * 服务端 actionGate 生成待确认项后，本组件通过 /api/v1/actions/pending
 * 拉取最新待确认操作，弹出确认/取消对话框；确认/取消走 REST 接口。
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto">
      <div className="w-[min(92vw,420px)] rounded-2xl border border-amber-400/20 bg-[#0d1017]/95 p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="text-2xl">⚠️</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-amber-300/90">需要你的确认</h3>
            <p className="mt-2 text-[15px] text-white/80 leading-relaxed break-words">{pending.description}</p>
            <p className="mt-2 text-[12px] text-white/30">该操作有风险，确认后才会执行。</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={cancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
          >
            取消
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium text-black bg-amber-400 hover:bg-amber-300 transition-colors disabled:opacity-50"
          >
            {busy ? '执行中…' : '确认执行'}
          </button>
        </div>
      </div>
    </div>
  );
}
