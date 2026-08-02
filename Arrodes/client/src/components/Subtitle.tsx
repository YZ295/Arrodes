/**
 * 透明字幕系统
 *
 * 全屏叠加层，在 3D 宇宙背景上透明显示 AI 回复字幕
 * 特性：白色文字 + 深色描边 → 任何背景下可见
 *       打字机逐字效果 (30ms/字)
 *       回复完成 2s 后淡出
 *       用户说话时自动隐藏
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { eventBus, EVENTS } from '../shared/events/EventBus';

/* ============================================================
 * 配置
 * ============================================================ */
const TYPING_SPEED = 30;          // ms/字
const FADE_OUT_DELAY = 2000;      // 完成后停留 ms
const FADE_OUT_DURATION = 500;    // 淡出过渡 ms

/* ============================================================
 * Subtitle
 * ============================================================ */
export default function Subtitle() {
  const [visible, setVisible] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [opacity, setOpacity] = useState(1);
  const [status, setStatus] = useState<'idle' | 'typing' | 'complete' | 'fading'>('idle');

  const fullTextRef = useRef('');
  const charIndexRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUserSpeakingRef = useRef(false);
  // status 的 ref 镜像（事件回调里读取最新状态）
  const statusRef = useRef<'idle' | 'typing' | 'complete' | 'fading'>('idle');

  // 同步 status → statusRef
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // 清理定时器
  const clearTimers = useCallback(() => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }, []);

  // 打字机逐字显示
  const startTyping = useCallback((text: string) => {
    clearTimers();
    fullTextRef.current = text;
    charIndexRef.current = 0;
    setDisplayText('');
    setOpacity(1);
    setStatus('typing');
    setVisible(true);

    typingTimerRef.current = setInterval(() => {
      charIndexRef.current++;
      if (charIndexRef.current >= fullTextRef.current.length) {
        // 打字完成
        if (typingTimerRef.current) {
          clearInterval(typingTimerRef.current);
          typingTimerRef.current = null;
        }
        setDisplayText(fullTextRef.current);
        setStatus('complete');

        // 2s 后淡出
        fadeTimerRef.current = setTimeout(() => {
          setStatus('fading');
          setOpacity(0);
          setTimeout(() => {
            setVisible(false);
            setDisplayText('');
            setStatus('idle');
          }, FADE_OUT_DURATION);
        }, FADE_OUT_DELAY);
      }
      setDisplayText(fullTextRef.current.slice(0, charIndexRef.current));
    }, TYPING_SPEED);
  }, [clearTimers]);

  // 立即隐藏（用户开始说话时）
  const hideImmediately = useCallback(() => {
    clearTimers();
    setVisible(false);
    setDisplayText('');
    setStatus('idle');
    setOpacity(1);
  }, [clearTimers]);

  // 监听事件
  useEffect(() => {
    // 最近一次 AI 回复文本（TTS 播放开始时显示）
    let lastReplyContent = '';

    const unsubReply = eventBus.on(EVENTS.VOICE_REPLY_COMPLETE, (data: unknown) => {
      const { content } = (data as { content?: string; sessionId?: string }) || {};
      if (content && !isUserSpeakingRef.current) {
        lastReplyContent = content;
        startTyping(content);
      }
    });

    // TTS 朗读开始 → 显示字幕（跟随朗读）
    const unsubPlayStart = eventBus.on(EVENTS.TTS_PLAY_START, () => {
      if (lastReplyContent && !isUserSpeakingRef.current) {
        startTyping(lastReplyContent);
      }
    });

    // TTS 朗读结束 → 淡出（不固定 2s，朗读完即隐）
    const unsubPlayEnd = eventBus.on(EVENTS.TTS_PLAY_END, () => {
      if (statusRef.current === 'typing' || statusRef.current === 'complete') {
        clearTimers();
        setStatus('fading');
        setOpacity(0);
        setTimeout(() => {
          setVisible(false);
          setDisplayText('');
          setStatus('idle');
        }, FADE_OUT_DURATION);
      }
    });

    const unsubRecord = eventBus.on(EVENTS.VOICE_RECORDING_START, () => {
      // 用户开始说话 → 隐藏字幕
      isUserSpeakingRef.current = true;
      hideImmediately();
    });

    const unsubRecordEnd = eventBus.on(EVENTS.VOICE_RECORDING_END, () => {
      isUserSpeakingRef.current = false;
    });

    // 也监听消息发送（文字输入时隐藏字幕）
    const unsubMsg = eventBus.on(EVENTS.VOICE_MESSAGE_SEND, () => {
      hideImmediately();
    });

    return () => {
      unsubReply();
      unsubPlayStart();
      unsubPlayEnd();
      unsubRecord();
      unsubRecordEnd();
      unsubMsg();
      clearTimers();
    };
  }, [startTyping, hideImmediately, clearTimers]);

  // 组件卸载清理
  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] pointer-events-none select-none"
      style={{
        opacity,
        transition: `opacity ${FADE_OUT_DURATION}ms ease-out`,
      }}
    >
      <p
        className="text-center whitespace-pre-wrap"
        style={{
          color: '#ffffff',
          fontSize: 'clamp(18px, 3.5vw, 32px)',
          lineHeight: 1.6,
          fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontWeight: 500,
          letterSpacing: '0.05em',
          textShadow:
            '0 0 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.8)',
          maxWidth: 'min(800px, 85vw)',
          // 打字光标
          borderRight: status === 'typing' ? '2px solid rgba(255,255,255,0.7)' : 'none',
          animation: status === 'typing' ? 'cursor-blink 0.8s step-end infinite' : 'none',
        }}
      >
        {displayText}
      </p>

      <style>{`
        @keyframes cursor-blink {
          0%, 100% { border-color: rgba(255,255,255,0.7); }
          50% { border-color: transparent; }
        }
      `}</style>
    </div>
  );
}
