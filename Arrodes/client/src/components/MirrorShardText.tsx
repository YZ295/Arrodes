/**
 * 镜片碎片字幕 - 诡异虚空风格
 *
 * AI 回复逐字从虚空裂隙中弹出，带青色光晕残影 + glitch 抖动
 */
import { useEffect, useState, useRef, memo } from 'react';

interface MirrorShardTextProps {
  text: string;
  charDelay?: number;
  color?: string;
  className?: string;
}

export default memo(function MirrorShardText({
  text, charDelay = 40, color = '#e0f7fa', className = '',
}: MirrorShardTextProps) {
  const [visibleChars, setVisibleChars] = useState(0);
  const [, setComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTextRef = useRef('');

  useEffect(() => {
    if (text !== prevTextRef.current) {
      setVisibleChars(0);
      setComplete(false);
      prevTextRef.current = text;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (!text) return;

    timerRef.current = setInterval(() => {
      setVisibleChars((prev) => {
        if (prev >= text.length) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setComplete(true);
          return text.length;
        }
        return prev + 1;
      });
    }, charDelay);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, charDelay]);

  if (!text) return null;

  const chars = text.split('');

  return (
    <p className={`font-light leading-relaxed tracking-wide ${className}`} style={{ color }}>
      {chars.map((char, i) => {
        const visible = i < visibleChars;
        const isCurrent = visible && i === visibleChars - 1;
        const clsName = visible ? 'char-shard' : '';
        const animDelay = visible ? `${i * charDelay}ms` : '0ms';
        const ts = isCurrent ? `0 0 12px ${color}88` : '';

        return (
          <span
            key={i}
            className={clsName}
            style={{
              visibility: visible ? 'visible' : 'hidden',
              animationDelay: animDelay,
              color,
              textShadow: ts,
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        );
      })}
    </p>
  );
});
