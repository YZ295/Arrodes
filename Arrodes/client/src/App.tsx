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
import { useVoiceChat } from './voice/hooks/useVoiceChat';
import { useWakeWord } from './voice/hooks/useWakeWord';

const App = memo(function App() {
  const [sidebarView, setSidebarView] = useState<SidebarView>('conversation');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const voice = useVoiceChat();
  const wake = useWakeWord(() => voice.startRecording());
  const wakeStart = wake.start;
  const wakeStop = wake.stop;
  const spacePttRef = useRef(false);

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
        {/* 唤醒监听状态提示 */}
        {wake.isSupported && wake.isListening && !voice.isRecording && (
          <div className="absolute top-3 right-4 z-40 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[12px] text-white/40 pointer-events-none">
            唤醒监听中 · 说「嘿阿罗德斯」
          </div>
        )}

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
