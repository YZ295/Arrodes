/**
 * 阿罗德斯 · 主应用 v5.0
 *
 * 全新布局：
 * ┌──────┬───────────────────────┐
 * │      │                       │
 * │ Side │    AI 字幕 (上方)      │
 * │ bar  │                       │
 * │      │      🌍 主星球          │
 * │      │                       │
 * │      │    用户输入 (下方)     │
 * │      │                       │
 * │      ├───────────────────────┤
 * │      │ [🎤] [输入框] [→]      │
 * └──────┴───────────────────────┘
 */
import { useState, useEffect, useRef, memo } from 'react';
import { eventBus, EVENTS } from './shared/events/EventBus';
import { getPluginManager } from './core/PluginManager';
import { initTtsRegistry } from './modules/voice/TtsEngineRegistry';
import { initSttRegistry } from './modules/voice/SttEngineRegistry';
import Sidebar, { type SidebarView } from './components/Sidebar';
import ChatOverlay from './components/ChatOverlay';
import PanelView from './components/PanelView';
import Subtitle from './components/Subtitle';
import ConfirmDialog from './components/ConfirmDialog';
import FolderPicker from './components/FolderPicker';
import { useVoiceChat } from './voice/hooks/useVoiceChat';
import { useWakeWord } from './voice/hooks/useWakeWord';
import { useWorkspaceStore } from './store/workspaceStore';
import CanvasPanel from './components/CanvasPanel';
import WallpaperBackground from './components/WallpaperBackground';
import { getWorkspaceLayout } from './ui/layoutPolicy';
import { useContinuousVision } from './modules/vision/useContinuousVision';
import { usePetBoundsListener, usePetCommandHandler } from './desktop-pet/desktopPetBridge';
import { setObservationExclusion } from './modules/vision/useContinuousVision';
import { useDesktopPetPublisher } from './desktop-pet/desktopPetBridge';

const App = memo(function App() {
  const [sidebarView, setSidebarView] = useState<SidebarView>('conversation');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const voice = useVoiceChat();
  // 挂在应用根部：切走视觉面板后屏幕观察仍保持运行。
  const continuousVision = useContinuousVision(voice.isSpeaking);

  // 桌宠右键菜单「视觉观察」命令：经 BroadcastChannel 切换主窗口的持续观察
  // 管家窗口边界 → 观察帧排除区域（观察画面中永远看不到管家本人，防自我反馈）
  usePetBoundsListener((rect) => setObservationExclusion(rect));

  usePetCommandHandler((command) => {
    if (command !== 'vision-toggle' || !continuousVision) return;
    if (continuousVision.active) {
      continuousVision.stop();
    } else {
      void continuousVision.start();
    }
  });
  useDesktopPetPublisher({
    active: continuousVision.active,
    analyzing: continuousVision.analyzing,
    error: continuousVision.error,
    observation: continuousVision.observation,
  });
  const wake = useWakeWord(() => voice.startRecording());
  const wakeStart = wake.start;
  const wakeStop = wake.stop;
  const spacePttRef = useRef(false);

  useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const { workspaces, activeWorkspaceId, loadWorkspaces } = useWorkspaceStore();
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const projectDir = activeWorkspace?.config?.projectDir;
  const permission = activeWorkspace?.config?.permission === 'full' ? 'full' : 'default';

  const updateWorkspaceConfig = async (patch: { projectDir?: string; permission?: string }) => {
    try {
      const res = await fetch(`/api/v1/workspaces/${activeWorkspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadWorkspaces();
    } catch {
      // 静默：设置失败不打断对话
    }
  };

  useEffect(() => {
    initTtsRegistry();
    initSttRegistry();

    const pm = getPluginManager();
    pm.activate('builtin.logger').catch(() => {});
    pm.activate('builtin.wallpaper').catch(() => {});

    // 首次交互解锁音频
    const unlock = () => voice.unlockAudio();
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    eventBus.emit(EVENTS.APP_READY);

    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [voice]);

  // 首次交互后再开启唤醒词监听（避免自动触发麦克风权限）
  useEffect(() => {
    const start = () => wakeStart();
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
  }, [wakeStart]);

  // 唤醒监听与录音互斥：录音时暂停唤醒，空闲时恢复
  useEffect(() => {
    if (voice.isRecording) wakeStop();
    else wakeStart();
  }, [voice.isRecording, wakeStart, wakeStop]);

  // 键盘按住说话（Space）：非输入框聚焦时按住开始、松开结束
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || el.isContentEditable;
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isEditable(e.target)) return;
      e.preventDefault();
      spacePttRef.current = true;
      voice.startRecording();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !spacePttRef.current) return;
      spacePttRef.current = false;
      voice.stopRecording();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [voice.startRecording, voice.stopRecording]);

  const showPanel = sidebarView !== 'conversation';
  const layout = getWorkspaceLayout(viewportWidth, sidebarCollapsed);
  const narrow = layout.panelPresentation === 'full';
  const compactNavigation = layout.compactNavigation && !(narrow && mobileNavOpen);

  return (
    <div className="w-full h-full flex overflow-hidden bg-[var(--color-bg-deep)]">
      {/* 左侧栏：功能导航 + 会话列表（一体） */}
      <Sidebar
        currentView={sidebarView}
        onViewChange={(v) => { setSidebarView(v); setMobileNavOpen(false); }}
        collapsed={compactNavigation}
        onToggle={() => narrow ? setMobileNavOpen((p) => !p) : setSidebarCollapsed((p) => !p)}
        overlay={narrow && mobileNavOpen}
        isConnected={voice.isConnected}
        currentSessionId={voice.currentSessionId}
      />
      {narrow && mobileNavOpen && <button aria-label="关闭导航" className="absolute inset-0 z-40 bg-black/60" onClick={() => setMobileNavOpen(false)} />}

      {/* 主区域：3D 背景 + 覆盖层 */}
      <div className="relative flex-1 min-w-0 overflow-hidden bg-[color:var(--color-bg-canvas)]/80">
        {/* Wallpaper Engine 壁纸背景层（未连接/失败时透明露出黑底） */}
        <WallpaperBackground />

        {/* 对话覆盖层（仅 conversation 视图显示） */}
        {!showPanel && (
          <ChatOverlay
            messages={voice.messages}
            isRecording={voice.isRecording}
            recordingDuration={voice.recordingDuration}
            recordingVolume={voice.recordingVolume}
            isLoading={voice.isLoading}
            isConnected={voice.isConnected}
            interimText={voice.interimText}
            isSpeaking={voice.isSpeaking}
            ttsError={voice.ttsError}
            wakeListening={wake.isSupported && wake.isListening && !voice.isRecording}
            error={voice.error}
            showMemoryToast={voice.showMemoryToast}
            memoryToastText={voice.memoryToastText}
            startRecording={voice.startRecording}
            stopRecording={voice.stopRecording}
            sendTextMessage={voice.sendTextMessage}
            replayTTS={voice.replayTTS}
            stopTTS={voice.stopTTS}
            stopAll={voice.stopAll}
            isMuted={voice.isMuted}
            toggleMuted={voice.toggleMuted}
            projectDir={projectDir}
            permission={permission}
            onPickProject={() => setPickerOpen(true)}
            onSetPermission={(p) => updateWorkspaceConfig({ permission: p })}
          />
        )}

        {/* 画布（T-06：全屏节点连线视图，节点内可直接对话） */}
        {sidebarView === 'canvas' && (
          <CanvasPanel onBack={() => setSidebarView('workspace')} />
        )}

        {/* 面板覆盖层（非 conversation 视图） */}
        {showPanel && sidebarView !== 'canvas' && (
          <PanelView
            view={sidebarView}
            ttsConfig={voice.ttsConfig}
            ttsVoices={voice.ttsVoices}
            ttsProviders={voice.ttsProviders}
            setTtsConfig={voice.setTtsConfig}
            onBack={() => setSidebarView('conversation')}
            onNavigate={setSidebarView}
            continuousVision={continuousVision}
          />
        )}

        {/* 全局 AI 字幕（跟随 TTS 朗读，全屏居中） */}
        <Subtitle />

        {/* 高风险操作确认弹窗 */}
        <ConfirmDialog
          messages={voice.messages}
          sessionId={voice.currentSessionId}
          onAppendAssistant={voice.appendAssistantMessage}
        />

        {/* 主输入栏的项目文件夹选择器 */}
        <FolderPicker
          open={pickerOpen}
          initialPath={projectDir}
          onClose={() => setPickerOpen(false)}
          onSelect={async (p) => {
            setPickerOpen(false);
            await updateWorkspaceConfig({ projectDir: p });
          }}
        />
      </div>
    </div>
  );
});

export default App;
