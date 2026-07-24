/**
 * 语音对话面板
 * 半透明磨砂玻璃风格的聊天界面
 */
import { useCallback } from 'react';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import { useVoiceChat } from './hooks/useVoiceChat';

export default function VoiceDialog() {
  const {
    messages,
    isRecording,
    isLoading,
    isConnected,
    startRecording,
    stopRecording,
    sendTextMessage,
    currentSessionId,
  } = useVoiceChat();

  const handleSendText = useCallback((text: string) => {
    sendTextMessage(text);
  }, [sendTextMessage]);

  const handleStartRecording = useCallback(() => {
    startRecording();
  }, [startRecording]);

  const handleStopRecording = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return (
    <div
      className="
        absolute bottom-6 right-6 z-50
        w-[380px] h-[520px] max-h-[80vh]
        rounded-2xl
        bg-[var(--color-bg-glass)]
        backdrop-blur-xl
        border border-white/10
        shadow-2xl
        flex flex-col
        overflow-hidden
        select-none
      "
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}
          />
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            阿罗德斯
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
          {currentSessionId ? (
            <span className="truncate max-w-[120px]">
              ID: {currentSessionId.slice(0, 8)}
            </span>
          ) : (
            <span>新会话</span>
          )}
        </div>
      </div>

      {/* 消息列表 */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* 输入区域 */}
      <ChatInput
        onSendText={handleSendText}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        isRecording={isRecording}
        disabled={!isConnected}
      />
    </div>
  );
}
