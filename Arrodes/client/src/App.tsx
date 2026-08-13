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
import { useState, useEffect, memo } from 'react';
import { eventBus, EVENTS } from './shared/events/EventBus';
import { getPluginManager } from './core/PluginManager';
import { initTtsRegistry } from './modules/voice/TtsEngineRegistry';
import { initSttRegistry } from './modules/voice/SttEngineRegistry';
import Sidebar, { type SidebarView } from './components/Sidebar';
import ChatOverlay from './components/ChatOverlay';
import PanelView from './components/PanelView';
import Universe from './universe/Universe';
import Subtitle from './components/Subtitle';
import ConfirmDialog from './components/ConfirmDialog';
import { useVoiceChat } from './voice/hooks/useVoiceChat';

const App = memo(function App() {
  const [sidebarView, setSidebarView] = useState<SidebarView>('conversation');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const voice = useVoiceChat();

  useEffect(() => {
    initTtsRegistry();
    initSttRegistry();

    const pm = getPluginManager();
    pm.activate('builtin.logger').catch(() => {});

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

  const showPanel = sidebarView !== 'conversation';

  return (
    <div className="w-full h-full flex overflow-hidden bg-[#050608]">
      {/* 左侧栏：功能导航 + 会话列表（一体） */}
      <Sidebar
        currentView={sidebarView}
        onViewChange={(v) => setSidebarView(v)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
        currentSessionId={voice.currentSessionId}
      />

      {/* 主区域：3D 背景 + 覆盖层 */}
      <div className="relative flex-1 overflow-hidden">
        {/* 3D 宇宙背景 */}
        <Universe />

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
          />
        )}

        {/* 面板覆盖层（非 conversation 视图） */}
        {showPanel && (
          <PanelView
            view={sidebarView}
            ttsConfig={voice.ttsConfig}
            ttsVoices={voice.ttsVoices}
            setTtsConfig={voice.setTtsConfig}
            onBack={() => setSidebarView('conversation')}
            onNavigate={setSidebarView}
          />
        )}

        {/* 全局 AI 字幕（跟随 TTS 朗读，全屏居中） */}
        <Subtitle />

        {/* 高风险操作确认弹窗 */}
        <ConfirmDialog messages={voice.messages} onAppendAssistant={voice.appendAssistantMessage} />
      </div>
    </div>
  );
});

export default App;
