/**
 * 侧边栏面板路由
 *
 * 根据 sidebar 当前视图渲染对应面板。
 * 对话视图不在面板中渲染（由 ChatOverlay 覆盖在星球上方）。
 */
import { memo, useState, useEffect } from 'react';
import type { SidebarView } from './Sidebar';
import ModelSettings from './ModelSettings';
import TTSControl from './TTSControl';
import MemoryPanel from './MemoryPanel';
import ProfilePanel from './ProfilePanel';
import VisionPanel from '../modules/vision/VisionPanel';
import WorkspacePanel from './WorkspacePanel';

interface PanelViewProps {
  view: SidebarView;
  ttsConfig: { engine: string; voiceId: string; rate: number; pitch: number };
  ttsVoices: Array<{ id: string; name: string; gender: string; style: string }>;
  setTtsConfig: (config: Partial<{ engine: 'server'; voiceId: string; rate: number; pitch: number }>) => void;
  onBack: () => void;
  /** 切换到指定视图（人物卡点击人物 → 记忆库搜索） */
  onNavigate: (view: SidebarView) => void;
}

function PlaceholderPanel({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
        <span className="text-2xl font-mono text-white/20">{icon}</span>
      </div>
      <h2 className="text-lg font-semibold text-white/70 mb-2">{title}</h2>
      <p className="text-sm text-white/30 max-w-xs">{description}</p>
    </div>
  );
}

export default memo(function PanelView(props: PanelViewProps) {
  const { view, ttsConfig, setTtsConfig, onBack, onNavigate } = props;

  return (
    <div className="absolute inset-0 z-35 flex justify-end pointer-events-none">
      <div className="w-full max-w-md h-full bg-black/50 backdrop-blur-xl border-l border-white/5
        flex flex-col pointer-events-auto animate-fade-in">
        {/* 顶部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <button onClick={onBack} className="text-white/40 hover:text-white transition-colors text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <span className="text-sm font-medium text-white/60">
            {view === 'profile' ? '人物画像' : view === 'memory' ? '记忆库' : view === 'vision' ? '视觉理解'
            : view === 'skills' ? '智能体技能' : view === 'settings' ? '配置' : view === 'workflow' ? '工作流'
            : view === 'workspace' ? '工作区' : view === 'mobile' ? '移动端' : '高级'}
          </span>
          <div className="w-12" />
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {view === 'skills' && <SkillsPanel />}
          {view === 'workspace' && <WorkspacePanel />}
          {view === 'profile' && <ProfilePanel onNavigate={onNavigate} />}
          {view === 'memory' && <MemoryPanel onClose={onBack} />}
          {view === 'vision' && <VisionPanel />}
          {view === 'settings' && (
            <div className="p-5 space-y-6">
              <div>
                <h3 className="text-[16px] text-white/30 mb-3 uppercase tracking-wider">AI 模型</h3>
                <ModelSettings />
              </div>
              <div className="border-t border-white/5 pt-5">
                <h3 className="text-[16px] text-white/30 mb-3 uppercase tracking-wider">语音合成</h3>
                <TTSControl
                  currentVoice={ttsConfig.voiceId} rate={ttsConfig.rate} pitch={ttsConfig.pitch}
                  onVoiceChange={(v) => setTtsConfig({ voiceId: v })}
                  onRateChange={(r) => setTtsConfig({ rate: r })}
                  onPitchChange={(p) => setTtsConfig({ pitch: p })}
                />
              </div>
            </div>
          )}
          {view === 'workflow' && (
            <PlaceholderPanel title="工作流引擎" description="即将支持 n8n / Coze 集成，创建自动化工作流来扩展阿罗德斯的能力。" icon="W" />
          )}
          {view === 'mobile' && (
            <PlaceholderPanel title="移动端接入" description="支持通过手机远程连接阿罗德斯，随时随地对话。" icon="D" />
          )}
          {view === 'advanced' && <AdvancedPanel />}
        </div>
      </div>
    </div>
  );
});

function AdvancedPanel() {
  return (
    <div className="p-5 space-y-4">
      <div>
        <h3 className="text-[16px] text-white/30 mb-3 uppercase tracking-wider">系统状态</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-white/40">WebSocket</span><span className="text-green-400/60">已连接</span></div>
          <div className="flex justify-between"><span className="text-white/40">Edge TTS</span><span className="text-cyan-400/60">可用</span></div>
          <div className="flex justify-between"><span className="text-white/40">管道引擎</span><span className="text-amber-400/60">v4.5</span></div>
          <div className="flex justify-between"><span className="text-white/40">插件系统</span><span className="text-amber-400/60">1 已激活</span></div>
        </div>
      </div>
    </div>
  );
}

function SkillsPanel() {
  const [skills, setSkills] = useState<Array<{
    name: string; description: string; args: Array<{ name: string; type: string; description: string; required?: boolean }>;
  }>>([]);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);

  const loadSkills = () => {
    fetch('/api/v1/skills')
      .then((r) => r.json())
      .then((d) => setSkills(d.skills || []))
      .catch(() => setError('无法加载技能列表（后端未启动）'));
  };

  useEffect(() => { loadSkills(); }, []);

  const removeSkill = async (name: string) => {
    if (!confirm(`确定要删除技能 "${name}" 吗？`)) return;
    try {
      await fetch(`/api/v1/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
      loadSkills();
    } catch { setError('删除失败'); }
  };

  const addSkill = async () => {
    if (!newName.trim() || !newDesc.trim()) return;
    if (!newUrl.trim() && !newText.trim()) { setError('请填写 URL 或 回复文本'); return; }
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/v1/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), url: newUrl.trim(), replyText: newText.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '请求失败' }));
        setError(err.error || '添加失败');
      } else {
        setShowAdd(false);
        setNewName(''); setNewDesc(''); setNewUrl(''); setNewText('');
        loadSkills();
      }
    } catch { setError('网络错误'); } finally { setAdding(false); }
  };

  return (
    <div className="p-5 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[16px] text-white/30 uppercase tracking-wider">已注册技能</span>
        <div className="flex items-center gap-2">
          <span className="text-[16px] text-amber-400/60">{skills.length} 个</span>
          <button
            onClick={() => setShowAdd((p) => !p)}
            className="text-[16px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
          >
            {showAdd ? '取消' : '+ 添加'}
          </button>
        </div>
      </div>

      {error && <div className="text-[16px] text-red-400 bg-red-500/10 px-3 py-1.5 rounded">{error}</div>}

      {/* 添加表单 */}
      {showAdd && (
        <div className="bg-white/3 rounded-xl p-4 border border-cyan-400/20 space-y-3">
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="技能名称 (英文, 如 my_weather)"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[16px] text-white/80 outline-none focus:border-cyan-400/30"
          />
          <input
            value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
            placeholder="技能描述 (LLM 靠这个判断何时调用)"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[16px] text-white/80 outline-none focus:border-cyan-400/30"
          />
          <input
            value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
            placeholder="Webhook URL (可选, 调用 GET 此地址获取回复)"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[16px] text-white/80 outline-none focus:border-cyan-400/30"
          />
          <input
            value={newText} onChange={(e) => setNewText(e.target.value)}
            placeholder="固定回复文本 (可选, 不填 URL 时生效)"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[16px] text-white/80 outline-none focus:border-cyan-400/30"
          />
          <button
            onClick={addSkill} disabled={adding}
            className="w-full py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-[16px] hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
          >
            {adding ? '添加中…' : '确认添加'}
          </button>
        </div>
      )}

      {/* 技能卡片 */}
      {skills.map((skill) => (
        <div key={skill.name} className="bg-white/3 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all group">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[16px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">{skill.name}</span>
            <button
              onClick={() => removeSkill(skill.name)}
              className="ml-auto w-4 h-4 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500/20 text-red-400/60 hover:text-red-400"
              title={`删除 ${skill.name}`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-white/60 mb-2">{skill.description}</p>
          {skill.args.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skill.args.map((arg) => (
                <span key={arg.name} className="text-[16px] px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                  {arg.name}{arg.required ? <span className="text-red-400/60 ml-0.5">*</span> : ''}
                  <span className="text-white/15 ml-1">: {arg.type}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {skills.length === 0 && !error && <div className="text-center text-white/20 py-8 text-sm">正在加载…</div>}

      <div className="border-t border-white/5 pt-3 mt-4">
        <div className="text-[16px] text-white/20">
          内置技能删除后重启会恢复。自定义技能（custom: 前缀）可增删。<br />
          自定义技能支持 Webhook URL（GET 调用）或固定文本回复。
        </div>
      </div>
    </div>
  );
}
