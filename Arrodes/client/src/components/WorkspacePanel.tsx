/**
 * 工作区面板（Agent 大宇宙）· workspace-v2
 *
 * 顶部：工作区切换器（切换/新建，localStorage 持久化）
 * 主体：Agent 连接器 + 共享记忆（按激活工作区隔离）
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';

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
  const { workspaces, workspacesLoading, activeWorkspaceId, loadWorkspaces, setActiveWorkspace, createWorkspace } = useWorkspaceStore();
  const [agents, setAgents] = useState<AgentConnector[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [memories, setMemories] = useState<WorkspaceMemory[]>([]);
  const [memoryStats, setMemoryStats] = useState<{ total: number; byAgent: Record<string, number> }>({ total: 0, byAgent: {} });
  const [note, setNote] = useState('');
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [taskConfirm, setTaskConfirm] = useState('');
  const [taskLoading, setTaskLoading] = useState(false);
  const taskAbortRef = useRef<AbortController | null>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  const load = useCallback(async (wsId: string) => {
    try {
      const res = await fetch(`/api/v1/workspace?ws=${encodeURIComponent(wsId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(data.agents || []);
      setConnected(data.connected || []);
      setMemories(data.memories?.recent || []);
      setMemoryStats(data.memories?.stats || { total: 0, byAgent: {} });
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

  // 切换工作区 / 首次加载时刷新连接器与记忆
  useEffect(() => {
    setLoading(true);
    setError('');
    load(activeWorkspaceId);
  }, [activeWorkspaceId, load]);

  const addMemory = useCallback(async () => {
    if (!note.trim()) return;
    try {
      const res = await fetch('/api/v1/workspace/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: note.trim(), type: 'note', workspaceId: activeWorkspaceId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNote('');
      await load(activeWorkspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入失败');
    }
  }, [note, activeWorkspaceId, load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const ws = await createWorkspace({ name: newName.trim() });
    if (ws) {
      setActiveWorkspace(ws.id);
      setNewName('');
      setShowNew(false);
    } else {
      setError('创建工作区失败');
    }
  };

  const syncObsidian = useCallback(async () => {
    setSyncMsg('同步中…');
    try {
      const res = await fetch('/api/v1/workspace/memories/sync-obsidian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: activeWorkspaceId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSyncMsg(`✓ 已同步 ${data.count} 条记忆 → Obsidian`);
    } catch (err) {
      setSyncMsg(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [activeWorkspaceId]);

  const toggleMember = useCallback(async (agentId: string) => {
    const isConnected = connected.includes(agentId);
    const url = isConnected
      ? `/api/v1/workspaces/${activeWorkspaceId}/members/${agentId}`
      : `/api/v1/workspaces/${activeWorkspaceId}/members`;
    try {
      const res = await fetch(url, {
        method: isConnected ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: isConnected ? undefined : JSON.stringify({ memberType: 'agent', memberId: agentId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load(activeWorkspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '接入/断开失败');
    }
  }, [connected, activeWorkspaceId, load]);

  const openChat = useCallback(async (agentId: string) => {
    setChatAgent(agentId);
    setChatError('');
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/agents/${agentId}/messages`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChatMessages((data.messages || []).map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content })));
    } catch (err) {
      setChatError(err instanceof Error ? err.message : '加载对话失败');
    }
  }, [activeWorkspaceId]);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading || !chatAgent) return;
    setChatInput('');
    setChatError('');
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/agents/${chatAgent}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setChatLoading(false);
    }
  }, [activeWorkspaceId, chatAgent, chatInput, chatLoading]);

  const runTask = useCallback(async () => {
    if (!taskConfirm || !chatAgent || taskLoading) return;
    setTaskLoading(true);
    setChatError('');
    setChatMessages((prev) => [...prev, { role: 'user', content: `【任务】${taskConfirm}` }]);
    const controller = new AbortController();
    taskAbortRef.current = controller;
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/agents/${chatAgent}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: taskConfirm }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `【任务结果】${data.reply}` }]);
      setTaskConfirm('');
    } catch (err) {
      if (controller.signal.aborted) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: '【任务已中止】' }]);
      } else {
        setChatError(err instanceof Error ? err.message : '派发失败');
      }
    } finally {
      setTaskLoading(false);
      taskAbortRef.current = null;
    }
  }, [activeWorkspaceId, chatAgent, taskConfirm, taskLoading]);

  const abortTask = useCallback(() => {
    taskAbortRef.current?.abort();
  }, []);

  return (
    <div className="p-5 space-y-6">
      {/* 工作区切换器 */}
      <div>
        <h3 className="text-[16px] text-white/30 uppercase tracking-wider mb-2">工作区</h3>
        <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{active?.icon || '🪐'}</span>
            <select
              value={activeWorkspaceId}
              onChange={(e) => setActiveWorkspace(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white/80 outline-none appearance-none cursor-pointer [&>option]:bg-[#0b1026]"
            >
              {workspaces.filter((w) => w.status === 'active').map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between text-[16px] text-white/30">
            <span>
              {active?.stats ? `会话 ${active.stats.sessions} · 记忆 ${active.stats.memories} · 共享 ${active.stats.wsMemories}` : workspacesLoading ? '加载中…' : ''}
            </span>
            <button onClick={() => setShowNew((p) => !p)} className="text-cyan-400/80 hover:text-cyan-400">
              {showNew ? '取消' : '+ 新建'}
            </button>
          </div>
          {showNew && (
            <div className="flex gap-2 pt-1">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="工作区名称，如：大创项目"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[16px] text-white/80 placeholder-white/25 focus:outline-none focus:border-cyan-400/30"
              />
              <button onClick={handleCreate} className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-[16px] hover:bg-cyan-500/30">
                创建
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 与智能体对话窗 */}
      {chatAgent && (
        <div className="rounded-xl border border-blue-500/25 bg-white/3 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-white/85">与 {chatAgent} 对话</h3>
            <button onClick={() => setChatAgent(null)} className="text-[16px] text-white/40 hover:text-white/70">✕ 关闭</button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2 [scrollbar-width:thin]">
            {chatMessages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
                <span className={`inline-block max-w-[85%] px-3 py-1.5 rounded-lg whitespace-pre-wrap break-words ${
                  m.role === 'user' ? 'bg-blue-500/20 text-blue-100' : 'bg-white/5 text-white/80'
                }`}>
                  {m.content}
                </span>
              </div>
            ))}
            {chatLoading && <div className="text-sm text-white/30">智能体思考中…</div>}
            {chatMessages.length === 0 && !chatLoading && (
              <div className="text-sm text-white/25 text-center py-2">开始对话吧</div>
            )}
          </div>
          {chatError && <div className="text-sm text-red-400/80">{chatError}</div>}
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="输入消息…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-blue-400/40"
            />
            <button
              onClick={sendChat}
              disabled={chatLoading}
              className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 disabled:opacity-40 transition-colors"
            >
              发送
            </button>
          </div>
          {/* 派发任务 */}
          {taskConfirm ? (
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2 space-y-2">
              <div className="text-sm text-amber-200/90 break-words">向 {chatAgent} 派发任务：{taskConfirm}</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTaskConfirm('')}
                  disabled={taskLoading}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  onClick={runTask}
                  disabled={taskLoading}
                  className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
                >
                  确认执行
                </button>
              </div>
            </div>
          ) : taskLoading ? (
            <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
              <span className="text-sm text-white/50">任务执行中…</span>
              <button onClick={abortTask} className="text-sm text-red-400/80 hover:text-red-300">中止</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && taskInput.trim()) {
                    setTaskConfirm(taskInput.trim());
                    setTaskInput('');
                  }
                }}
                placeholder="派发任务，如：把登录页改成深色主题…"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-blue-400/40"
              />
              <button
                onClick={() => {
                  if (taskInput.trim()) {
                    setTaskConfirm(taskInput.trim());
                    setTaskInput('');
                  }
                }}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-white/80 transition-colors"
              >
                派发任务
              </button>
            </div>
          )}
        </div>
      )}

      {/* 连接器（agent） */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[16px] text-white/30 uppercase tracking-wider">Agent 连接器</h3>
          <button onClick={() => load(activeWorkspaceId)} className="text-[16px] text-white/40 hover:text-white/70">↻ 刷新探测</button>
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
                  <span className="text-[16px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">{TYPE_LABEL[a.type]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[16px] ${a.available ? 'text-emerald-400/80' : 'text-white/25'}`}>
                    {a.available ? '可用' : '未检测到'}
                  </span>
                  <button
                    onClick={() => toggleMember(a.id)}
                    disabled={!a.available}
                    className={`text-[16px] px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${
                      connected.includes(a.id)
                        ? 'bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30'
                        : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/80'
                    }`}
                  >
                    {!a.available ? '不可接入' : connected.includes(a.id) ? '断开' : '接入'}
                  </button>
                  <button
                    onClick={() => openChat(a.id)}
                    disabled={!a.available || !connected.includes(a.id)}
                    className="text-[16px] px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors disabled:opacity-40"
                  >
                    对话
                  </button>
                </div>
              </div>
              <div className="text-[16px] text-white/35 mt-1">{a.detail}</div>
              {a.capabilities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {a.capabilities.map((c) => (
                    <span key={c} className="text-[16px] px-1.5 py-0.5 rounded bg-emerald-400/10 text-emerald-300/70 border border-emerald-400/10">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 共享记忆 */}
      <div className="border-t border-white/5 pt-5">
        <h3 className="text-[16px] text-white/30 uppercase tracking-wider mb-3">
          共享记忆 <span className="text-white/20">（{active?.name || ''} · 共 {memoryStats.total} 条 · 全部共享）</span>
        </h3>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-[16px] text-white/25">统一格式全量写入 Obsidian 知识库，供所有接入 Agent 共享。</p>
          <button
            onClick={syncObsidian}
            className="shrink-0 text-[16px] px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/20 hover:bg-blue-500/25 transition-colors"
          >
            同步到 Obsidian
          </button>
        </div>
        {syncMsg && <p className="text-[16px] text-blue-300/80 mb-2">{syncMsg}</p>}
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
              <div className="text-[16px] text-white/25 mb-1">
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
