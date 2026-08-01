/**
 * 解密字幕组件 — 赛博朋克风格
 *
 * 灵感来源：React Bits DecyptedText + GlitchText
 * AI 回复逐字"解密"显示：先从乱码字符滚动过渡到正确文字。
 */
import { useEffect, useState, useRef, memo } from 'react';

const CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789日月金木水火土风雷山泽天地玄黄宇宙洪荒';

interface DecryptedSubtitleProps {
  text: string;
  /** 解密速度 (ms/字) */
  speed?: number;
  /** 乱码滚动次数 */
  scrambleCount?: number;
  /** 是否激活解密 */
  active?: boolean;
  /** 文字颜色 */
  color?: string;
  /** 文字大小 */
  className?: string;
}

export default memo(function DecryptedSubtitle({
  text,
  speed = 35,
  scrambleCount = 3,
  active = true,
  color = '#e0f7fa',
  className = '',
}: DecryptedSubtitleProps) {
  const [displayed, setDisplayed] = useState('');
  const [, setDoneLength] = useState(0);
  const targetRef = useRef(text);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(0);

  useEffect(() => {
    if (!active || !text) {
      setDisplayed('');
      setDoneLength(0);
      doneRef.current = 0;
      return;
    }

    targetRef.current = text;

    // 只在文本变化时重新开始
    if (text !== targetRef.current) {
      doneRef.current = 0;
      setDoneLength(0);
    }

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const target = targetRef.current;
      const done = doneRef.current;

      if (done >= target.length) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        return;
      }

      // 构建显示文本：已完成部分 = 真实文字，进行中 = 乱码滚动
      let result = target.slice(0, done);
      const remaining = target.length - done;

      if (remaining > 0) {
        // 当前正在解密的字符：逐帧随机滚动
        const currentDone = done;
        result += scrambleChar(target[currentDone], Math.floor(Math.random() * scrambleCount));

        // 后续字符：随机乱码
        for (let i = done + 1; i < target.length; i++) {
          result += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }

      setDisplayed(result);

      // 每 scrambleCount 帧推进一个字符
      if (done < target.length && Math.random() > 0.3) {
        doneRef.current = done + 1;
        setDoneLength(done + 1);
      }
    }, speed);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed, scrambleCount, active]);

  if (!text || !active) return null;

  return (
    <p
      className={`font-light leading-relaxed tracking-wide transition-all duration-500 ${className}`}
      style={{
        color,
        textShadow: `0 0 10px ${color}33, 0 0 30px ${color}22, 0 2px 4px rgba(0,0,0,0.8)`,
      }}
    >
      {displayed}
    </p>
  );
});

function scrambleChar(target: string, frame: number): string {
  if (frame === 0) return target;
  // 逐步接近目标字符（先随机，再接近，最后正确）
  if (frame >= 2) return target;
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}
