import { useEffect, useState } from 'react';
import { ButlerPanel } from './components/ButlerPanel';
import { ButlerPetPanel } from './components/ButlerPetPanel';
import ModelSettings from './components/ModelSettings';
import MemoryPanel from './components/MemoryPanel';
import VisionPanel from './modules/vision/VisionPanel';
import {
  useContinuousVision,
  setObservationExclusion,
  setExclusionReporter,
  setSelfWindowVisible,
  setVisionTickReporter,
} from './modules/vision/useContinuousVision';
import { useDesktopPetPublisher, usePetBoundsListener, usePetCommandHandler } from './desktop-pet/desktopPetBridge';

/** Owns screen capture for the standalone Butler. Hiding this window keeps observation alive. */
export default function ButlerWorkspace() {
  const [tab, setTab] = useState<'records' | 'vision' | 'memory' | 'pet' | 'models'>('records');
  const vision = useContinuousVision(false);
  usePetBoundsListener((rect) => setObservationExclusion('pet', rect));

  // 排除区诊断：让「遮罩到底有没有生效」可被观察。
  // 只写进 desktop.log，绝不上屏——诊断文案上屏就成了一段可被视觉读回的文本。
  useEffect(() => {
    setExclusionReporter((report) => {
      window.arrodesButler?.logDiagnostic('exclusion', JSON.stringify(report));
    });
    setVisionTickReporter((tick) => {
      window.arrodesButler?.logDiagnostic('vision-tick', JSON.stringify({ tick }));
    });
    return () => {
      setExclusionReporter(null);
      setVisionTickReporter(null);
    };
  }, []);

  // 本窗口可见性：隐藏时不该进排除区（--pet 下管家窗口 show:false，
  // 但仍能读到 outerWidth/outerHeight，白遮屏幕约 30%）
  useEffect(() => {
    let cancelled = false;
    void window.arrodesButler?.getSelfVisible().then((visible) => {
      if (!cancelled) setSelfWindowVisible(visible);
    });
    window.arrodesButler?.onSelfVisible(setSelfWindowVisible);
    return () => { cancelled = true; };
  }, []);

  usePetCommandHandler((command) => {
    if (command !== 'vision-toggle') return;
    if (vision.active) vision.stop(); else void vision.start();
  });
  useDesktopPetPublisher({ active: vision.active, analyzing: vision.analyzing, error: vision.error, observation: vision.observation });

  return <main className="min-h-screen bg-[#0f1115] text-white/85 p-5">
    <header className="flex items-center justify-between gap-4 mb-5">
      <div><h1 className="text-xl font-semibold">阿罗德斯管家</h1>
        <p className="text-sm text-white/45 mt-1">桌宠与屏幕活动记录</p></div>
      <span className="text-sm text-cyan-300">{vision.active ? '正在共享主屏幕' : '屏幕观察已关闭'}</span>
    </header>
    <nav className="flex gap-2 mb-4" aria-label="管家功能">
      {([['records', '活动记录'], ['vision', '屏幕观察'], ['memory', '记忆审核'], ['pet', '桌宠形象'], ['models', '对话模型']] as const).map(([id,label]) =>
        <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
          className={`rounded-lg px-4 py-2 text-sm ${tab === id ? 'bg-blue-500/20 text-blue-200' : 'bg-white/5 text-white/55'}`}>{label}</button>)}
    </nav>
    <section className="max-w-4xl">
      {tab === 'records' && <ButlerPanel />}
      {tab === 'vision' && <VisionPanel continuousVision={vision} />}
      {tab === 'memory' && <MemoryPanel onClose={() => setTab('records')} />}
      {tab === 'pet' && <ButlerPetPanel />}
      {tab === 'models' && <ModelSettings />}
    </section>
    <p className="text-xs text-white/35 mt-5">关闭窗口会收起到托盘；退出请使用托盘菜单。活动采集请在“活动记录”中单独启停。</p>
  </main>;
}
