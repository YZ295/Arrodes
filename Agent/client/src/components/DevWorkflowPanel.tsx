/**
 * 开发工作流面板（工作区级）
 *
 * 6 阶段状态机：idea → spec → tickets → implement → review → done。
 * 左侧工作流列表，右侧详情：阶段时间线、状态、产出物、推进/登记。
 * 支持从多 Agent 研讨会一键转入（sourceSeminarId）。
 */
import { useCallback, useEffect, useState } from 'react';

export const DEV_STAGES = ['idea', 'spec', 'tickets', 'implement', 'review', 'done'] as const;

const STAGE_LABEL: Record<string, string> = {
  idea: '构想',
  spec: '规格',
  tickets: '拆任务',
  implement: '实现',
  review: '审查',
  done: '完成',
};

interface Workflow {
  id: string;
  title: string;
  projectDir: string;
  sourceSeminarId: string | null;
  stage: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowStep {
  id: string;
  stage: string;
  status: 'pending' | 'in_progress' | 'done';
  artifactPath: string;
  notes: string;
}

interface DevWorkflowPanelProps {
  workspaceId: string;
  onClose: () => void;
  /** 从研讨会转入时传入的研讨会主题（创建后自动填入标题） */
  seminarTitle?: string;
  seminarId?: string;
}

export default function DevWorkflowPanel({
  workspaceId,
  onClose,
  seminarTitle,
  seminarId,
}: DevWorkflowPanelProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [title, setTitle] = useState(seminarTitle ?? '');
  const [projectDir, setProjectDir] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/workflows`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWorkflows(data.workflows || []);
      if (data.workflows?.length && !activeId) {
        setActiveId(data.workflows[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, [workspaceId, activeId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/workflows/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSteps(data.steps || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    }
  }, [workspaceId]);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => {
    if (activeId) void loadDetail(activeId);
  }, [activeId, loadDetail]);

  const create = useCallback(async () => {
    if (!title.trim()) { setError('请填写标题'); return; }
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          projectDir: projectDir.trim() || undefined,
          sourceSeminarId: seminarId || undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTitle('');
      setProjectDir('');
      setActiveId(data.workflow.id);
      await loadList();
      await loadDetail(data.workflow.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  }, [workspaceId, title, projectDir, seminarId, loadList, loadDetail]);

  const advance = useCallback(async (artifactPath: string, notes: string) => {
    if (!activeId) return;
    setError('');
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/workflows/${activeId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifactPath: artifactPath.trim() || undefined, notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadList();
      await loadDetail(activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '推进失败');
    }
  }, [workspaceId, activeId, loadList, loadDetail]);

  const updateStep = useCallback(async (stage: string, patch: { status?: string; artifactPath?: string; notes?: string }) => {
    if (!activeId) return;
    setError('');
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/workflows/${activeId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, ...patch }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadDetail(activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败');
    }
  }, [workspaceId, activeId, loadDetail]);

  const active = workflows.find((w) => w.id === activeId);
  const [artifactInput, setArtifactInput] = useState('');
  const [notesInput, setNotesInput] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[860px] max-w-[94vw] h-[76vh] flex flex-col rounded-2xl border border-blue-500/25 bg-[#0b0e14]/95 shadow-[0_24px_80px_rgba(0,0,0,0.7),0_0_40px_rgba(59,130,246,0.08)] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/8 bg-[#0d1017]">
          <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
          <h3 className="text-[14px] font-semibold text-white/90">开发工作流</h3>
          <span className="text-[11px] text-white/35">构想 → 规格 → 拆任务 → 实现 → 审查 → 完成</span>
          <button onClick={onClose} className="ml-auto text-white/40 hover:text-white/80 transition-colors text-[14px] px-2 py-1 rounded-lg hover:bg-white/5">
            ✕ 关闭
          </button>
        </div>

        {error && <div className="px-5 py-1.5 bg-red-500/10 text-red-300/90 text-[12px]">{error}</div>}

        <div className="flex-1 min-h-0 flex">
          {/* 左：列表 + 创建 */}
          <div className="w-64 shrink-0 border-r border-white/8 bg-[#0c0f15]/60 flex flex-col">
            <div className="px-3 py-2.5 space-y-2 border-b border-white/6">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={seminarTitle ? '研讨会主题已填入…' : '新工作流标题，如：登录页重构'}
                className="w-full bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 placeholder-white/25 outline-none focus:border-blue-400/40"
              />
              <input
                value={projectDir}
                onChange={(e) => setProjectDir(e.target.value)}
                placeholder="项目目录（可选）"
                className="w-full bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 placeholder-white/25 outline-none focus:border-blue-400/40"
              />
              <button
                onClick={() => void create()}
                disabled={creating}
                className="w-full px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/35 border border-blue-400/25 text-[12px] font-medium disabled:opacity-40 transition-colors"
              >
                {creating ? '创建中…' : seminarId ? '从研讨会创建' : '创建工作流'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 [scrollbar-width:thin]">
              {workflows.length === 0 && (
                <div className="text-[11px] text-white/25 p-2">暂无工作流</div>
              )}
              {workflows.map((w) => (
                <button
                  key={w.id}
                  onClick={() => { setActiveId(w.id); void loadDetail(w.id); }}
                  className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
                    activeId === w.id
                      ? 'bg-blue-500/15 border-blue-400/30'
                      : 'bg-white/3 border-white/6 hover:bg-white/8'
                  }`}
                >
                  <div className="text-[12px] text-white/80 truncate">{w.title}</div>
                  <div className="text-[10px] text-white/35 mt-0.5">
                    {STAGE_LABEL[w.stage] ?? w.stage} · 更新于 {new Date(w.updatedAt).toLocaleString('zh-CN', { hour12: false })}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 右：详情 */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!active && (
              <div className="flex-1 flex items-center justify-center text-[12px] text-white/25">
                选择或创建一个开发工作流
              </div>
            )}
            {active && (
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 [scrollbar-width:thin]">
                <div className="flex items-center gap-2">
                  <h4 className="text-[14px] font-semibold text-white/90">{active.title}</h4>
                  {active.sourceSeminarId && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-400/10 text-emerald-300/80 border border-emerald-400/20 text-[10px]">
                      来自研讨会
                    </span>
                  )}
                  {active.projectDir && (
                    <span className="text-[11px] text-white/35 truncate max-w-[220px]">{active.projectDir}</span>
                  )}
                </div>

                {/* 阶段时间线 */}
                <div className="flex items-center gap-1 px-1">
                  {DEV_STAGES.map((s, i) => {
                    const step = steps.find((st) => st.stage === s);
                    const isCurrent = s === active.stage;
                    const isDone = step?.status === 'done';
                    return (
                      <div key={s} className="flex items-center flex-1">
                        <div className={`flex flex-col items-center gap-1 flex-1 ${isCurrent ? 'opacity-100' : isDone ? 'opacity-90' : 'opacity-35'}`}>
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] border transition-colors ${
                            isCurrent
                              ? 'bg-blue-500/30 border-blue-400/50 text-blue-100'
                              : isDone
                                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                                : 'bg-white/5 border-white/10 text-white/40'
                          }`}>
                            {isDone ? '✓' : i + 1}
                          </div>
                          <span className={`text-[10px] ${isCurrent ? 'text-blue-300' : 'text-white/40'}`}>
                            {STAGE_LABEL[s]}
                          </span>
                        </div>
                        {i < DEV_STAGES.length - 1 && (
                          <div className={`h-px flex-1 mb-4 ${isDone ? 'bg-emerald-400/40' : 'bg-white/10'}`} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 步骤详情 */}
                <div className="space-y-2">
                  {steps.map((step) => (
                    <div key={step.id} className={`rounded-lg border px-3 py-2.5 ${
                      step.status === 'done'
                        ? 'border-emerald-400/20 bg-emerald-400/5'
                        : step.status === 'in_progress'
                          ? 'border-blue-400/25 bg-blue-400/5'
                          : 'border-white/8 bg-white/3'
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-white/85">
                          {STAGE_LABEL[step.stage]}
                        </span>
                        <span className={`text-[10px] px-1.5 py-px rounded ${
                          step.status === 'done'
                            ? 'bg-emerald-400/15 text-emerald-300'
                            : step.status === 'in_progress'
                              ? 'bg-blue-400/15 text-blue-300'
                              : 'bg-white/8 text-white/40'
                        }`}>
                          {step.status === 'done' ? '已完成' : step.status === 'in_progress' ? '进行中' : '待开始'}
                        </span>
                        {step.stage === active.stage && step.status !== 'done' && (
                          <span className="ml-auto text-[10px] text-blue-300/70">当前阶段</span>
                        )}
                      </div>
                      {step.artifactPath && (
                        <div className="text-[11px] text-white/55 mt-1 font-mono truncate">产出：{step.artifactPath}</div>
                      )}
                      {step.notes && (
                        <div className="text-[11px] text-white/45 mt-0.5">{step.notes}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* 推进 + 登记 */}
                {active.stage !== 'done' && (
                  <div className="rounded-lg border border-white/10 bg-white/3 px-3 py-2.5 space-y-2">
                    <div className="text-[11px] text-white/40">
                      当前阶段「{STAGE_LABEL[active.stage]}」产出物（可选，如 Plan/business-spec.md）
                    </div>
                    <input
                      value={artifactInput}
                      onChange={(e) => setArtifactInput(e.target.value)}
                      placeholder="产出物路径"
                      className="w-full bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 placeholder-white/25 outline-none focus:border-blue-400/40"
                    />
                    <input
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="备注（可选）"
                      className="w-full bg-[#14171d] border border-white/10 rounded-lg px-2.5 py-1.5 text-[12px] text-white/80 placeholder-white/25 outline-none focus:border-blue-400/40"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          void advance(artifactInput, notesInput);
                          setArtifactInput('');
                          setNotesInput('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/35 border border-blue-400/25 text-[12px] font-medium transition-colors"
                      >
                        推进到「{STAGE_LABEL[DEV_STAGES[DEV_STAGES.indexOf(active.stage as (typeof DEV_STAGES)[number]) + 1]]}」
                      </button>
                      <button
                        onClick={() => {
                          void updateStep(active.stage, { status: 'done', artifactPath: artifactInput, notes: notesInput });
                          setArtifactInput('');
                          setNotesInput('');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/6 text-white/60 hover:bg-white/12 border border-white/10 text-[12px] transition-colors"
                      >
                        仅标记完成
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
