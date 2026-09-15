import { memo } from 'react';
import { getStatusPresentation } from '../ui/statusPresentation';

interface StatusBarProps {
  isConnected: boolean;
  isSpeaking: boolean;
  error: string | null;
  ttsError: string | null;
  uiHidden: boolean;
  onToggleUi: () => void;
  isMuted: boolean;
  onToggleMuted: () => void;
  onReplayTTS: () => void;
  wakeListening?: boolean;
}

export default memo(function StatusBar(props: StatusBarProps) {
  const status = getStatusPresentation({
    connected: props.isConnected,
    speaking: props.isSpeaking,
    error: props.error,
    ttsError: props.ttsError,
  });
  const dot = status.tone === 'error' ? 'bg-red-400' : status.tone === 'pending' ? 'bg-amber-400' : status.tone === 'active' ? 'bg-blue-400' : 'bg-emerald-400';

  return (
    <header className="arrodes-status pointer-events-auto flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[color:var(--color-bg-nav)]/70 px-5 backdrop-blur-md">
      <div className="min-w-0 flex-1 py-2">
      <div role="status" aria-live="polite" className="arrodes-status__label flex min-w-0 items-center gap-2 text-sm" title={status.label}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className={`truncate ${status.tone === 'error' ? 'text-red-300' : 'text-[var(--color-text-secondary)]'}`}>{status.label}</span>
        {status.recoverableTts && <button type="button" aria-label="重新播报" onClick={props.onReplayTTS} className="shrink-0 rounded-md px-1 text-xs text-blue-300 hover:text-blue-100">重试</button>}
      </div>
      {props.wakeListening && <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]" title="说「嘿阿罗德斯」即可唤醒">唤醒词已开启</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button aria-pressed={props.isMuted} onClick={props.onToggleMuted} className={`rounded-lg px-2 py-2 text-sm transition-colors ${props.isMuted ? 'bg-blue-500/15 text-blue-200' : 'text-[var(--color-text-secondary)] hover:bg-white/5 hover:text-white'}`}>
          {props.isMuted ? '已静音' : '静音'}
        </button>
        <button aria-label={props.uiHidden ? '显示对话' : '隐藏对话'} onClick={props.onToggleUi} className="rounded-lg px-2 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-white/5 hover:text-white">
          {props.uiHidden ? '显示' : '隐藏'}
        </button>
      </div>
    </header>
  );
});
