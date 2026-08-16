/**
 * 画布面板（T-06 自由画布 · Phase B）
 *
 * 参照 open-ai-canvas / JarvisHub 的节点连线思想：
 * - 节点 = 已接入的智能体（可拖拽定位，位置持久化到工作区 config.canvas）
 * - 中枢 = 阿罗德斯（记忆中枢：全量共享记忆 → 统一格式 → Obsidian）
 * - 连线 = 接入 + 全量共享记忆（中枢 ↔ 各智能体）
 * - 从左侧连接器面板点击「添加」→ 接入 + 生成节点；节点内可直接对话/断开
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  Handle, Position, type Node, type Edge, type NodeProps, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkspaceStore } from '../store/workspaceStore';
import AgentChatPanel from './AgentChatPanel';

interface AgentConnector {
  id: string;
  name: string;
  type: 'native' | 'cli' | 'file';
  available: boolean;
  detail: string;
  capabilities: string[];
}

interface CanvasPosition {
  x: number;
  y: number;
}

type AgentNodeData = {
  agent: AgentConnector;
  isHub: boolean;
  onChat: (id: string) => void;
  onRemove: (id: string) => void;
} & Record<string, unknown>;

const HUB_ID = 'hub';
const NODE_W = 230;
const NODE_H = 120;

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, isHub, onChat, onRemove } = data;
  return (
    <div
      className={`rounded-xl border backdrop-blur-md transition-shadow ${
        isHub
          ? 'border-blue-400/40 bg-[#0c1226]/95 shadow-[0_0_24px_rgba(59,130,246,0.25)]'
          : 'border-white/12 bg-[#111318]/95 hover:border-blue-500/40'
      }`}
      style={{ width: NODE_W }}
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !border-0 !bg-blue-500" />
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${agent.available ? 'bg-emerald-400' : 'bg-white/15'}`} />
          <span className="text-[13px] font-semibold text-white/90 truncate">{agent.name}</span>
          <span className="ml-auto text-[10px] px-1.5 py-px rounded bg-white/8 text-white/40">
            {isHub ? '中枢' : agent.type === 'cli' ? 'CLI' : agent.type === 'native' ? '内置' : '文件'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {agent.capabilities.slice(0, 4).map((c) => (
            <span key={c} className="text-[10px] px-1.5 py-px rounded bg-emerald-400/10 text-emerald-300/70 border border-emerald-400/10">
              {c}
            </span>
          ))}
        </div>
        {isHub && (
          <div className="text-[11px] text-blue-300/60 mt-1.5 leading-snug">
            全量共享记忆 → 统一格式 → Obsidian
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          {!isHub && (
            <button
              type="button"
              onClick={() => onChat(agent.id)}
              disabled={!agent.capabilities.includes('chat')}
              className="flex-1 h-7 rounded-lg text-[12px] font-medium bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 transition-colors disabled:opacity-30"
            >
              对话
            </button>
          )}
          {!isHub && (
            <button
              type="button"
              onClick={() => onRemove(agent.id)}
              className="h-7 px-2 rounded-lg text-[12px] text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
              title="断开接入"
            >
              断开
            </button>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !border-0 !bg-blue-500" />
    </div>
  );
}

const nodeTypes: NodeTypes = { agent: AgentNode };

function CanvasInner({ onBack }: { onBack: () => void }) {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, loadWorkspaces } = useWorkspaceStore();
  const [agents, setAgents] = useState<AgentConnector[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [canvas, setCanvas] = useState<Record<string, CanvasPosition>>({});
  const [memories, setMemories] = useState<{ total: number }>({ total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId);

  const load = useCallback(async (wsId: string) => {
    setLoading(true);
    setError('');
    try {
      const [hubRes, detailRes] = await Promise.all([
        fetch(`/api/v1/workspace?ws=${encodeURIComponent(wsId)}`),
        fetch(`/api/v1/workspaces/${encodeURIComponent(wsId)}`),
      ]);
      if (!hubRes.ok || !detailRes.ok) throw new Error('加载失败');
      const hub = await hubRes.json();
      const detail = await detailRes.json();
      setAgents(hub.agents || []);
      setConnected(hub.connected || []);
      setMemories(hub.memories?.stats || { total: 0 });
      setCanvas((detail.workspace?.config?.canvas ?? {}) as Record<string, CanvasPosition>);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadWorkspaces(); }, [loadWorkspaces]);
  useEffect(() => {
    setChatAgent(null);
    void load(activeWorkspaceId);
  }, [activeWorkspaceId, load]);

  // 由「已接入成员 + 保存位置」构建节点/连线（中枢 = 阿罗德斯）
  useEffect(() => {
    const members = agents.filter((a) => connected.includes(a.id));
    const hubAgent = members.find((a) => a.id === 'arrodes');
    const others = members.filter((a) => a.id !== 'arrodes');
    const hubPos = canvas[HUB_ID] ?? { x: 0, y: 0 };
    const nextNodes: Node<AgentNodeData>[] = [
      {
        id: HUB_ID,
        type: 'agent',
        position: hubPos,
        data: {
          agent: hubAgent ?? {
            id: 'arrodes', name: '阿罗德斯', type: 'native', available: true,
            detail: '记忆中枢', capabilities: ['memory', 'skills'],
          },
          isHub: true,
          onChat: () => {},
          onRemove: () => {},
        },
      },
    ];
    others.forEach((agent, i) => {
      const angle = (i / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const radius = 280;
      nextNodes.push({
        id: agent.id,
        type: 'agent',
        position: canvas[agent.id] ?? {
          x: hubPos.x + Math.cos(angle) * radius - NODE_W / 2,
          y: hubPos.y + Math.sin(angle) * radius - NODE_H / 2,
        },
        data: {
          agent,
          isHub: false,
          onChat: (id) => setChatAgent(id),
          onRemove: (id) => void removeAgent(id),
        },
      });
    });
    setNodes(nextNodes);
    setEdges(others.map((a) => ({
      id: `edge-${a.id}`,
      source: HUB_ID,
      target: a.id,
      animated: true,
      label: '记忆共享',
      labelStyle: { fill: 'rgba(255,255,255,0.4)', fontSize: 11 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      style: { stroke: 'rgba(59,130,246,0.55)', strokeWidth: 1.5 },
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, connected, canvas]);

  const persistCanvas = useCallback((next: Record<string, CanvasPosition>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canvas: next }),
        });
        if (!res.ok) setError('保存画布位置失败');
      } catch {
        setError('保存画布位置失败');
      }
    }, 400);
  }, [activeWorkspaceId]);

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    setCanvas((prev) => {
      const next = { ...prev, [node.id]: { x: node.position.x, y: node.position.y } };
      persistCanvas(next);
      return next;
    });
  }, [persistCanvas]);

  const addAgent = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberType: 'agent', memberId: agentId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load(activeWorkspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '接入失败');
    }
  }, [activeWorkspaceId, load]);

  const removeAgent = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}/members/${agentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCanvas((prev) => {
        const next = { ...prev };
        delete next[agentId];
        persistCanvas(next);
        return next;
      });
      await load(activeWorkspaceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '断开失败');
    }
  }, [activeWorkspaceId, load, persistCanvas]);

  const resetLayout = useCallback(() => {
    setCanvas({});
    void persistCanvas({});
  }, [persistCanvas]);

  const palette = useMemo(
    () => agents.filter((a) => a.available && a.id !== 'arrodes' && !connected.includes(a.id)),
    [agents, connected],
  );

  const flow = useMemo(() => (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={onNodeDragStop}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={2}
      colorMode="dark"
      proOptions={{ hideAttribution: true }}
      defaultEdgeOptions={{ type: 'default' }}
      className="!bg-transparent"
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="rgba(255,255,255,0.12)" />
      <Controls position="bottom-left" showInteractive={false} />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={() => 'rgba(59,130,246,0.55)'}
        maskColor="rgba(3,6,12,0.75)"
        className="!bg-[#101318] !border !border-white/10"
      />
    </ReactFlow>
  ), [nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#07090d]">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/8 bg-[#0a0c11]/95 backdrop-blur">
        <button onClick={onBack} className="flex items-center gap-1 text-white/45 hover:text-white transition-colors text-[13px]">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <span className="text-[13px] text-white/70 font-medium">画布 · {active?.name ?? '工作区'}</span>
        <select
          value={activeWorkspaceId}
          onChange={(e) => setActiveWorkspace(e.target.value)}
          className="bg-[#14161b] border border-white/10 rounded-lg px-2 py-1 text-[12px] text-white/70 outline-none appearance-none cursor-pointer [&>option]:bg-[#14161b]"
        >
          {workspaces.filter((w) => w.status === 'active').map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <span className="text-[12px] text-white/30">共享记忆 {memories.total} 条</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void load(activeWorkspaceId)}
            className="px-2.5 py-1 rounded-lg text-[12px] text-white/50 bg-white/5 hover:bg-white/10 hover:text-white/80 transition-colors"
          >
            ↻ 刷新
          </button>
          <button
            onClick={resetLayout}
            className="px-2.5 py-1 rounded-lg text-[12px] text-white/50 bg-white/5 hover:bg-white/10 hover:text-white/80 transition-colors"
          >
            重置布局
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-1.5 bg-red-500/10 text-red-300/90 text-[12px]">{error}</div>
      )}

      {/* 画布主体 */}
      <div className="relative flex-1 min-h-0">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#07090d]/70 backdrop-blur-sm">
            <span className="text-sm text-white/35">正在装载画布…</span>
          </div>
        )}
        {flow}

        {/* 左侧：连接器面板（未接入的可用 agent） */}
        <div className="absolute left-3 top-3 z-20 w-56 rounded-xl border border-white/10 bg-[#0c0e13]/90 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-3">
          <div className="text-[11px] text-white/40 font-medium mb-2 uppercase tracking-wider">接入智能体</div>
          <div className="space-y-1.5 max-h-[46vh] overflow-y-auto [scrollbar-width:thin]">
            {palette.length === 0 && (
              <div className="text-[12px] text-white/25 py-2 text-center">全部已接入</div>
            )}
            {palette.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-white/3 hover:bg-white/6 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="flex-1 min-w-0 text-[12px] text-white/75 truncate">{a.name}</span>
                <button
                  onClick={() => void addAgent(a.id)}
                  className="px-1.5 py-0.5 rounded-md text-[11px] bg-blue-500/20 text-blue-200 hover:bg-blue-500/35 transition-colors"
                >
                  添加
                </button>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-white/25 mt-2 leading-snug">
            连线 = 接入 + 全量共享记忆；拖拽节点可定位，自动保存。
          </div>
        </div>
      </div>

      {/* 节点内对话（复用 AgentChatPanel） */}
      {chatAgent && (
        <AgentChatPanel
          workspaceId={activeWorkspaceId}
          agentId={chatAgent}
          onClose={() => setChatAgent(null)}
          onMemorySaved={async () => { await load(activeWorkspaceId); }}
          projectDir={active?.config?.projectDir}
          permission={active?.config?.permission === 'full' ? 'full' : 'default'}
          onUpdateWorkspace={async () => { await loadWorkspaces(); }}
        />
      )}
    </div>
  );
}

export default function CanvasPanel({ onBack }: { onBack: () => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onBack={onBack} />
    </ReactFlowProvider>
  );
}
