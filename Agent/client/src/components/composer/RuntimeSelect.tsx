import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../shared/utils/apiClient';
import ComposerMenu from './ComposerMenu';

interface SkillMode { id: string; name: string; description: string }
interface ModelInfo { id: string; label: string; provider: string; description?: string }
interface ModesResponse { modes: SkillMode[]; current: string }
interface ModelsResponse { models: ModelInfo[]; current: string }

export default function RuntimeSelect({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modes, setModes] = useState<SkillMode[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [currentMode, setCurrentMode] = useState('');
  const [currentModel, setCurrentModel] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    const [modeResult, modelResult] = await Promise.allSettled([
      api.get<ModesResponse>('/modes'),
      api.get<ModelsResponse>('/models'),
    ]);
    const nextErrors: string[] = [];
    if (modeResult.status === 'fulfilled') {
      setModes(modeResult.value.modes);
      setCurrentMode(modeResult.value.current);
    } else nextErrors.push('工作模式暂不可用');
    if (modelResult.status === 'fulfilled') {
      setModels(modelResult.value.models);
      setCurrentModel(modelResult.value.current);
    } else nextErrors.push('模型列表暂不可用');
    setErrors(nextErrors);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectMode = async (modeId: string) => {
    if (modeId === currentMode || busy) return;
    setBusy(true);
    try {
      const data = await api.post<{ current: string }>('/modes/select', { modeId });
      setCurrentMode(data.current);
    } catch {
      setErrors((current) => [...new Set([...current, '工作模式切换失败'])]);
    } finally { setBusy(false); }
  };

  const selectModel = async (modelId: string) => {
    if (modelId === currentModel || busy) return;
    setBusy(true);
    try {
      const data = await api.post<{ current: string }>('/models/select', { modelId });
      setCurrentModel(data.current);
      setOpen(false);
    } catch {
      setErrors((current) => [...new Set([...current, '模型切换失败'])]);
    } finally { setBusy(false); }
  };

  const selectedModel = models.find((model) => model.id === currentModel);
  const selectedMode = modes.find((mode) => mode.id === currentMode);
  const groups = useMemo(() => {
    const result = new Map<string, ModelInfo[]>();
    for (const model of models) result.set(model.provider, [...(result.get(model.provider) ?? []), model]);
    return [...result.entries()];
  }, [models]);

  return (
    <ComposerMenu
      open={open}
      onOpenChange={setOpen}
      align="right"
      widthClass="w-80"
      trigger={(isOpen) => (
        <button type="button" disabled={disabled} onClick={() => setOpen((value) => !value)}
          title="模型与工作模式"
          className="h-8 max-w-[190px] px-2.5 rounded-full text-[13px] font-medium text-white/60 hover:bg-white/10 hover:text-white/90 transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40">
          <svg className="w-3.5 h-3.5 text-white/45 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M4 7h16M4 17h16M8 4v6M16 14v6" strokeLinecap="round" />
          </svg>
          <span className="truncate">{selectedModel?.label ?? '运行配置'}</span>
          {selectedMode && <span className="text-white/30 shrink-0">· {selectedMode.name}</span>}
          <svg className={`w-3 h-3 text-white/40 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M3 4.5 6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    >
      <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-white/40">工作模式</div>
      <div className="grid grid-cols-2 gap-1 px-1.5 pb-2">
        {modes.map((mode) => (
          <button key={mode.id} type="button" disabled={busy} onClick={() => void selectMode(mode.id)} title={mode.description}
            className={`rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${mode.id === currentMode ? 'bg-blue-500/15 text-blue-200' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}>
            {mode.name}
          </button>
        ))}
      </div>
      <div className="mx-2 border-t border-white/8" />
      <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium text-white/40">模型</div>
      {groups.map(([provider, list]) => (
        <div key={provider} className="pb-1">
          <div className="px-2.5 py-1 text-[11px] text-white/25">{provider}</div>
          {list.map((model) => (
            <button key={model.id} type="button" disabled={busy} onClick={() => void selectModel(model.id)}
              className={`w-full rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${model.id === currentModel ? 'bg-white/8 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}>
              <span className="flex items-center justify-between gap-2"><span className="truncate">{model.label}</span>{model.id === currentModel && <svg className="h-4 w-4 shrink-0 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</span>
            </button>
          ))}
        </div>
      ))}
      {errors.length > 0 && (
        <div className="mx-1.5 mb-1.5 rounded-lg bg-red-500/8 px-2.5 py-2 text-[12px] text-red-300/90">
          <p>{errors.join('，')}</p>
          <button type="button" onClick={() => void load()} className="mt-1 text-blue-300 hover:text-blue-200">重新加载</button>
        </div>
      )}
    </ComposerMenu>
  );
}
