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
        transition: `opacity ${FADE_OUT_DURATION}ms ease-out, transform ${FADE_OUT_DURATION}ms ease-out`,
        transform: `translateX(-50%) ${status === 'fading' ? 'translateY(8px)' : 'translateY(0)'}`,
      }}
    >
      {/* 玻璃拟态浮现卡片（参考 border-beam 光束语言，与输入栏风格统一） */}
      <div className="relative rounded-2xl" style={{ padding: 1, borderRadius: 18 }}>
        {/* 边框光束层 */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            padding: 1,
            borderRadius: 18,
            background: 'linear-gradient(135deg, rgba(120,200,255,0.55), rgba(255,180,120,0.35), rgba(120,200,255,0.55))',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
          }}
        />
        {/* 玻璃内容层 */}
        <div
          className="rounded-[17px] px-6 py-4"
          style={{
            backgroundColor: 'rgba(10, 12, 20, 0.75)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <p
            className="text-center whitespace-pre-wrap"
            style={{
              color: '#f2f7ff',
              fontSize: 'clamp(16px, 2.6vw, 24px)',
              lineHeight: 1.7,
              fontFamily: '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
              fontWeight: 400,
              letterSpacing: '0.04em',
              maxWidth: 'min(640px, 80vw)',
              // 打字光标
              borderRight: status === 'typing' ? '2px solid rgba(120,200,255,0.8)' : 'none',
              animation: status === 'typing' ? 'cursor-blink 0.8s step-end infinite' : 'none',
            }}
          >
            {displayText}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes cursor-blink {
          0%, 100% { border-color: rgba(120,200,255,0.8); }
          50% { border-color: transparent; }
        }
      `}</style>
    </div>
  );
}
