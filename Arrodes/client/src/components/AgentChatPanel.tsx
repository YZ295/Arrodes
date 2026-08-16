/**
 * Agent 对话面板（聊天 + 派任务 + 语音 + 记记忆）
 * 从 WorkspacePanel 拆出，职责单一，面板只负责会话交互。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAudioRecorder } from '../voice/hooks/useAudioRecorder';
import FolderPicker from './FolderPicker';

interface AgentChatPanelProps {
  workspaceId: string;
  agentId: string;
  onClose: () => void;
  /** 记忆写入成功后回调（父面板刷新记忆列表） */
  onMemorySaved?: () => void;
  projectDir?: string;
  permission?: 'default' | 'full';
  onUpdateWorkspace?: (patch: { projectDir?: string; permission?: string }) => Promise<void> | void;
}

export default function AgentChatPanel({
  workspaceId,
  agentId,
  onClose,
  onMemorySaved,
  projectDir,
  permission = 'default',
  onUpdateWorkspace,
}: AgentChatPanelProps) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [taskConfirm, setTaskConfirm] = useState('');
  const [taskLoading, setTaskLoading] = useState(false);
  const taskAbortRef = useRef<AbortController | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const micHoldingRef = useRef(false);
  const recorder = useAudioRecorder();
  const [pickerOpen, setPickerOpen] = useState(false);

  // 打开时加载历史对话
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/messages`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setMessages((data.messages || []).map((m: { role: 'user' | 'assistant'; content: string }) => ({ role: m.role, content: m.content })));
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载对话失败');
      }
    })();
  }, [workspaceId, agentId]);

  const transcribe = useCallback(async (blob: Blob): Promise<string> => {
    const form = new FormData();
    form.append('audio', blob, 'audio.webm');
    const res = await fetch('/api/v1/stt/transcribe', { method: 'POST', body: form });
    if (!res.ok) throw new Error(`语音识别失败 (${res.status})`);
    const data = await res.json();
    return (data.text || '').trim();
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!voiceOn || !text) return;
    try {
      const res = await fetch('/api/v1/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 2000) }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.audioBase64) {
        const audio = new Audio(`data:${data.contentType || 'audio/wav'};base64,${data.audioBase64}`);
        audio.play().catch(() => {});
      }
    } catch {
      // 朗读失败静默降级
    }
  }, [voiceOn]);

  const sendChat = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      speak(data.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, agentId, input, loading, speak]);

  const stopAndTranscribe = useCallback(() => {
    if (!micHoldingRef.current) return;
    micHoldingRef.current = false;
    recorder.stopRecording().then(async (blob) => {
      if (!blob || blob.size === 0) return;
      setVoiceBusy(true);
      try {
        const text = await transcribe(blob);
        if (text) sendChat(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : '识别失败');
      } finally {
        setVoiceBusy(false);
      }
    });
  }, [recorder, transcribe, sendChat]);

  const runTask = useCallback(async (taskArg?: string) => {
    const task = taskArg ?? taskConfirm;
    if (!task || taskLoading) return;
    setTaskLoading(true);
    setError('');
    setMessages((prev) => [...prev, { role: 'user', content: `【任务】${task}` }]);
    const controller = new AbortController();
    taskAbortRef.current = controller;
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: `【任务结果】${data.reply}` }]);
      setTaskConfirm('');
      speak(`任务完成：${data.reply}`);
    } catch (err) {
      if (controller.signal.aborted) {
        setMessages((prev) => [...prev, { role: 'assistant', content: '【任务已中止】' }]);
      } else {
        setError(err instanceof Error ? err.message : '派发失败');
      }
    } finally {
      setTaskLoading(false);
      taskAbortRef.current = null;
    }
  }, [workspaceId, agentId, taskConfirm, taskLoading, speak]);

  const abortTask = useCallback(() => {
    taskAbortRef.current?.abort();
  }, []);

  const saveMemory = useCallback(async (content: string) => {
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/agents/${agentId}/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onMemorySaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入记忆失败');
    }
  }, [workspaceId, agentId, onMemorySaved]);

  return (
    <div className="rounded-xl border border-blue-500/25 bg-white/3 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/85">与 {agentId} 对话</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPickerOpen(true)}
            title="选择项目文件夹"
            className="text-[16px] px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
          >
            项目
          </button>
          <button
            onClick={() => onUpdateWorkspace?.({ permission: permission === 'full' ? 'default' : 'full' })}
            title={permission === 'full' ? '全部权限：任务自动执行，不确认' : '默认权限：高风险任务需确认'}
            className={`text-[16px] px-2 py-1 rounded-lg border transition-colors ${
              permission === 'full'
                ? 'bg-red-500/15 border-red-400/30 text-red-300 hover:bg-red-500/25'
                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
            }`}
          >
            {permission === 'full' ? '全部权限' : '默认权限'}
          </button>
          <button
            onClick={() => setVoiceOn((v) => !v)}
            title={voiceOn ? '关闭语音朗读' : '开启语音朗读'}
            className={`text-[16px] ${voiceOn ? 'text-blue-300/80' : 'text-white/30'} hover:text-blue-200 transition-colors`}
          >
            {voiceOn ? '🔊' : '🔇'}
          </button>
          <button onClick={onClose} className="text-[16px] text-white/40 hover:text-white/70">✕ 关闭</button>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto space-y-2 [scrollbar-width:thin]">
        {messages.map((m, i) => (
          <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
            <span className={`inline-block max-w-[85%] px-3 py-1.5 rounded-lg whitespace-pre-wrap break-words ${
              m.role === 'user' ? 'bg-blue-500/20 text-blue-100' : 'bg-white/5 text-white/80'
            }`}>
              {m.content}
            </span>
            {m.role === 'assistant' && (
              <button
                onClick={() => saveMemory(m.content)}
                className="block mt-1 text-[16px] text-white/30 hover:text-blue-300 transition-colors"
              >
                记入共享记忆
              </button>
            )}
          </div>
        ))}
        {loading && <div className="text-sm text-white/30">智能体思考中…</div>}
        {messages.length === 0 && !loading && (
          <div className="text-sm text-white/25 text-center py-2">开始对话吧</div>
        )}
      </div>
      {error && <div className="text-sm text-red-400/80">{error}</div>}
      <div className="flex gap-2">
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            micHoldingRef.current = true;
            recorder.startRecording().catch(() => {
              micHoldingRef.current = false;
            });
          }}
          onMouseUp={stopAndTranscribe}
          onMouseLeave={stopAndTranscribe}
          disabled={voiceBusy}
          title={recorder.isRecording ? '松开发送语音' : '按住说话'}
          className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40 ${
            recorder.isRecording
              ? 'bg-red-500/25 border-red-400/40 text-red-300'
              : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
          }`}
        >
          {recorder.isRecording ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="10" height="12" rx="1.5" /></svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          placeholder="输入消息…"
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-blue-400/40"
        />
        <button
          onClick={() => sendChat()}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 disabled:opacity-40 transition-colors"
        >
          发送
        </button>
      </div>
      {/* 派发任务 */}
      {taskConfirm ? (
        <div className="rounded-lg border border-blue-400/25 bg-blue-400/5 px-3 py-2 space-y-2">
          <div className="text-sm text-blue-200/90 break-words">向 {agentId} 派发任务：{taskConfirm}</div>
          <div className="flex gap-2">
            <button
              onClick={() => setTaskConfirm('')}
              disabled={taskLoading}
              className="px-3 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 disabled:opacity-40"
            >
              取消
            </button>
            <button
              onClick={() => runTask()}
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
              if (!taskInput.trim()) return;
              const t = taskInput.trim();
              setTaskInput('');
              if (permission === 'full') {
                runTask(t);
              } else {
                setTaskConfirm(t);
              }
            }}
            className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-sm text-white/80 transition-colors"
          >
            派发任务
          </button>
        </div>
      )}
      <FolderPicker
        open={pickerOpen}
        initialPath={projectDir}
        onClose={() => setPickerOpen(false)}
        onSelect={async (p) => {
          setPickerOpen(false);
          await onUpdateWorkspace?.({ projectDir: p });
        }}
      />
    </div>
  );
}
