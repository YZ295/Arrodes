/**
 * 工作区面板（Agent 大宇宙）
 *
 * 展示可接入工作区的 agent 连接器（Arrodes/Hermes/Codex/VS Code/WorkBuddy/Marvis/Crow5）
 * 与跨 agent 共享记忆。3D 宇宙渲染将在后续阶段加入。
 */
import { useState, useEffect, useCallback } from 'react';

interface AgentConnector {
  id: string;
  name: string;
  type: 'native' | 'cli' | 'file';
  available: boolean;
  detail: string;
  capabilities: string[];
}

interface WorkspaceMemory {
  id: string;
  content: string;
  sourceAgent: string;
  type: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  native: '内置',
  cli: '命令行',
  file: '文件级',
};

export default function WorkspacePanel() {
  const [agents, setAgents] = useState<AgentConnector[]>([]);
  const [memories, setMemories] = useState<WorkspaceMemory[]>([]);
  const [memoryStats, setMemoryStats] = useState<{ total: number; byAgent: Record<string, number> }>({ total: 0, byAgent: {} });
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/workspace');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(data.agents || []);
      setMemories(data.memories?.recent || []);
      setMemoryStats(data.memories?.stats || { total: 0, byAgent: {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addMemory = useCallback(async () => {
    if (!note.trim()) return;
    try {
      const res = await fetch('/api/v1/workspace/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: note.trim(), type: 'note' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNote('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入失败');
    }
  }, [note, load]);

  return (
    <div className="p-5 space-y-6">
      {/* 连接器（agent） */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs text-white/30 uppercase tracking-wider">Agent 连接器</h3>
          <button onClick={load} className="text-[10px] text-white/40 hover:text-white/70">↻ 刷新探测</button>
        </div>
        {loading && <div className="text-sm text-white/30">正在探测…</div>}
        {error && <div className="text-sm text-red-400/80 mb-2">{error}</div>}
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.id} className={`rounded-xl border px-3 py-2.5 ${
              a.available ? 'border-white/10 bg-white/3' : 'border-white/5 bg-white/1 opacity-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${a.available ? 'bg-emerald-400' : 'bg-white/15'}`} />
                  <span className="text-sm font-medium text-white/80">{a.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">{TYPE_LABEL[a.type]}</span>
                </div>
                <span className={`text-[10px] ${a.available ? 'text-emerald-400/80' : 'text-white/25'}`}>
                  {a.available ? '已接入' : '未检测到'}
                </span>
              </div>
              <div className="text-[11px] text-white/35 mt-1">{a.detail}</div>
              {a.capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {a.capabilities.map((c) => (
                    <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300/70 border border-emerald-400/10">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 共享记忆 */}
      <div className="border-t border-white/5 pt-5">
        <h3 className="text-xs text-white/30 uppercase tracking-wider mb-3">
          共享记忆 <span className="text-white/20">（共 {memoryStats.total} 条）</span>
        </h3>
        <div className="flex gap-2 mb-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMemory()}
            placeholder="写入一条共享记忆…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-white/30"
          />
          <button
            onClick={addMemory}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-white/80 transition-colors"
          >
            写入
          </button>
        </div>
        <div className="space-y-2">
          {memories.map((m) => (
            <div key={m.id} className="rounded-lg border border-white/5 bg-white/3 px-3 py-2">
              <div className="text-[10px] text-white/25 mb-1">
                {m.sourceAgent} · {m.type} · {new Date(m.createdAt).toLocaleTimeString()}
              </div>
              <div className="text-sm text-white/70 break-words">{m.content}</div>
            </div>
          ))}
          {memories.length === 0 && !loading && (
            <div className="text-sm text-white/25 text-center py-4">暂无共享记忆</div>
          )}
        </div>
      </div>
    </div>
  );
}
