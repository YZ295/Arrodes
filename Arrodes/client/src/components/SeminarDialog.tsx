/**
 * 研讨会面板（多 Agent 互相对话学习）
 *
 * 从画布顶栏「研讨会」进入：选两个已接入 agent + 主题 + 轮数，
 * 服务端 A/B 轮流对话（异步），本面板轮询展示逐轮对话；
 * 结束后展示阿罗德斯提炼的学习小结（结论/新知识/分歧/行动项），
 * 并提示可同步到 Obsidian（全量共享记忆）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface AgentOption {
  id: string;
  name: string;
  available: boolean;
  capabilities: string[];
}

interface Seminar {
  id: string;
  topic: string;
  agentA: string;
  agentB: string;
  rounds: number;
  status: 'running' | 'done' | 'failed';
  summary: string;
  error: string;
  createdAt: string;
}

interface SeminarMessage {
  speaker: string;
  content: string;
}

interface SeminarDialogProps {
  workspaceId: string;
  agents: AgentOption[];
  connected: string[];
  onClose: () => void;
  onMemorySaved?: () => void;
}

const POLL_MS = 2500;

export default function SeminarDialog({
  workspaceId,
  agents,
  connected,
  onClose,
  onMemorySaved,
}: SeminarDialogProps) {
  const candidates = agents.filter((a) => connected.includes(a.id) && a.available && a.id !== 'arrodes');
  const [agentA, setAgentA] = useState(candidates[0]?.id ?? '');
  const [agentB, setAgentB] = useState(candidates[1]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [rounds, setRounds] = useState(3);
  const [seminar, setSeminar] = useState<Seminar | null>(null);
  const [messages, setMessages] = useState<SeminarMessage[]>([]);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [history, setHistory] = useState<Seminar[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const loadSeminar = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/seminars/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSeminar(data.seminar);
      setMessages(data.messages || []);
      if (data.seminar.status !== 'running') {
        setActiveId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载研讨会失败');
    }
  }, [workspaceId]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/seminars`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(data.seminars || []);
    } catch {
      // 历史加载失败不打断主流程
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // 运行中轮询
  useEffect(() => {
    if (!activeId) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    void loadSeminar(activeId);
    pollRef.current = setInterval(() => void loadSeminar(activeId), POLL_MS);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [activeId, loadSeminar]);

  const start = useCallback(async () => {
    if (!agentA || !agentB || agentA === agentB) {
      setError('请选择两个不同的智能体');
      return;
    }
    if (!topic.trim()) {
      setError('请填写研讨主题');
      return;
    }
    setError('');
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/seminars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentA, agentB, topic: topic.trim(), rounds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSeminar(data.seminar);
      setMessages([]);
      setActiveId(data.seminar.id);
      setTopic('');
      void loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建研讨会失败');
    }
  }, [agentA, agentB, topic, rounds, workspaceId, loadHistory]);

  const syncObsidian = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/v1/workspace/memories/sync-obsidian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onMemorySaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  }, [workspaceId, onMemorySaved]);

  const nameOf = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);
  const running = seminar?.status === 'running';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[720px] max-w-[92vw] h-[76vh] flex flex-col rounded-2xl border border-blue-500/25 bg-[#0b0e14]/95 shadow-[0_24px_80px_rgba(0,0,0,0.7),0_0_40px_rgba(59,130,246,0.08)] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8 bg-[#0d1017]">
          <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
          <h3 className="text-[14px] font-semibold text-white/90">多智能体研讨会</h3>
          <span className="text-[11px] text-white/35">A/B 互相对话 → 阿罗德斯提炼学习 → 全量共享</span>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white/80 transition-colors text-[14px] px-2 py-1 rounded-lg hover:bg-white/5">
            ✕ 关闭
          </button>
        </div>

        {error && <div className="px-5 py-1.5 bg-red-500/10 text-red-300/90 text-[12px]">{error}</div>}

        {/* 配置区 */}
        <div className="px-5 py-3 border-b border-white/8 bg-[#0c0f15]/80">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/40">智能体 A</span>
              <select
                value={agentA}
                onChange={(e) => setAgentA(e.target.value)}
                className="bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 outline-none [&>option]:bg-[#14171d]"
              >
                {candidates.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <span className="text-white/30 text-[14px] pb-1.5">↔</span>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/40">智能体 B</span>
              <select
                value={agentB}
                onChange={(e) => setAgentB(e.target.value)}
                className="bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 outline-none [&>option]:bg-[#14171d]"
              >
                {candidates.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <span className="text-[11px] text-white/40">研讨主题</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void start(); }}
                placeholder="如：如何设计画布的状态层？"
                disabled={running}
                className="bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 placeholder-white/25 outline-none focus:border-blue-400/40 disabled:opacity-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-white/40">轮数</span>
              <select
                value={rounds}
                onChange={(e) => setRounds(parseInt(e.target.value, 10))}
                disabled={running}
                className="bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 outline-none [&>option]:bg-[#14171d] disabled:opacity-40"
              >
                {[1, 2, 3, 4, 5, 6].map((r) => <option key={r} value={r}>{r} 轮</option>)}
              </select>
            </div>
            <button
              onClick={() => void start()}
              disabled={running || candidates.length < 2}
              className="px-4 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/35 border border-blue-400/25 text-[12px] font-medium disabled:opacity-35 transition-colors"
            >
              {running ? '研讨中…' : '开始研讨'}
            </button>
          </div>
          {candidates.length < 2 && (
            <div className="text-[11px] text-amber-300/70 mt-2">需要至少两个可对话的智能体接入画布</div>
          )}
        </div>

        {/* 主体：左 = 研讨记录，右 = 历史 */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0 flex flex-col">
            {!seminar && (
              <div className="flex-1 flex items-center justify-center text-[12px] text-white/25">
                选择智能体与主题，开始一场研讨会
              </div>
            )}
            {seminar && (
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3 [scrollbar-width:thin]">
                <div className="flex items-center gap-2 text-[12px] text-white/50">
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-200 border border-blue-400/20">
                    {nameOf(seminar.agentA)} ↔ {nameOf(seminar.agentB)}
                  </span>
                  <span>{seminar.topic}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {running ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-blue-300/70">研讨中…</span>
                      </>
                    ) : seminar.status === 'done' ? (
                      <span className="text-emerald-300/80">已完成</span>
                    ) : (
                      <span className="text-red-300/80">失败</span>
                    )}
                  </span>
                </div>

                {messages.map((m, i) => (
                  <div key={i} className="flex gap-2.5">
                    <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-md bg-white/8 text-[11px] text-white/60 h-fit">
                      {nameOf(m.speaker)}
                    </span>
                    <span className="flex-1 text-[13px] leading-relaxed text-white/80 whitespace-pre-wrap break-words bg-white/3 border border-white/8 rounded-lg px-3 py-2">
                      {m.content}
                    </span>
                  </div>
                ))}
                {seminar.status === 'running' && messages.length === 0 && (
                  <div className="text-[12px] text-white/30 text-center py-4">等待第一位智能体发言…</div>
                )}

                {/* 学习小结 */}
                {seminar.status === 'done' && seminar.summary && (
                  <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[12px] font-semibold text-emerald-300/90">阿罗德斯 · 学习小结</span>
                      <button
                        onClick={() => void syncObsidian()}
                        disabled={syncing}
                        className="ml-auto px-2 py-0.5 rounded-md bg-white/6 text-[11px] text-white/60 hover:bg-white/12 hover:text-white/85 border border-white/10 disabled:opacity-40 transition-colors"
                      >
                        {syncing ? '同步中…' : '同步到 Obsidian'}
                      </button>
                    </div>
                    <pre className="text-[12px] leading-relaxed text-emerald-100/80 whitespace-pre-wrap font-sans">
                      {seminar.summary}
                    </pre>
                  </div>
                )}
                {seminar.status === 'failed' && (
                  <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-[12px] text-red-200/80">
                    {seminar.error || '研讨会执行失败'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 右侧：历史记录 */}
          <div className="w-52 shrink-0 border-l border-white/8 bg-[#0c0f15]/60 flex flex-col">
            <div className="px-3 py-2 text-[11px] text-white/40 font-medium border-b border-white/6">历史研讨会</div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 [scrollbar-width:thin]">
              {history.length === 0 && (
                <div className="text-[11px] text-white/25 p-2">暂无记录</div>
              )}
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setActiveId(h.id);
                    void loadSeminar(h.id);
                  }}
                  className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
                    activeId === h.id
                      ? 'bg-blue-500/15 border-blue-400/30'
                      : 'bg-white/3 border-white/6 hover:bg-white/8'
                  }`}
                >
                  <div className="text-[12px] text-white/80 truncate">{h.topic}</div>
                  <div className="text-[10px] text-white/35 mt-0.5">
                    {nameOf(h.agentA)} ↔ {nameOf(h.agentB)} · {h.rounds} 轮
                  </div>
                  <div className="text-[10px] mt-1">
                    {h.status === 'done'
                      ? <span className="text-emerald-300/70">已沉淀学习 ✓</span>
                      : h.status === 'running'
                        ? <span className="text-blue-300/70">进行中…</span>
                        : <span className="text-red-300/70">失败</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
