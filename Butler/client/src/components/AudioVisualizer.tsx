/**
 * 音频可视化组件
 *
 * 参考 AIRI 的实时语音流水线视觉反馈。
 * 用 Canvas 绘制实时波形/频谱条，展示录音和播放状态。
 *
 * 模式：
 * - 'bars' 频谱条（适合 TTS 播放动画）
 * - 'wave' 波形（适合录音反馈）
 * - 'ring' 环形脉冲（适合待机呼吸动画）
 *
 * 用法：
 * ```tsx
 * <AudioVisualizer mode="bars" level={volLevel} isActive={isRecording} />
 * ```
 */
import { useRef, useEffect, useMemo } from 'react';

export type VisualizerMode = 'bars' | 'wave' | 'ring';

interface AudioVisualizerProps {
  mode?: VisualizerMode;
  /** 音量等级 0~255 */
  level?: number;
  /** 频率数据数组（用于频谱条） */
  frequencyData?: Uint8Array;
  /** 是否激活 */
  isActive?: boolean;
  /** Canvas 宽度 */
  width?: number;
  /** Canvas 高度 */
  height?: number;
  /** 主色调 */
  color?: string;
  /** CSS 类名 */
  className?: string;
}

const DEFAULTS = {
  width: 200,
  height: 40,
  color: '#3b82f6',
  barCount: 32,
};

export default function AudioVisualizer({
  mode = 'bars',
  level = 0,
  frequencyData,
  isActive = false,
  width = DEFAULTS.width,
  height = DEFAULTS.height,
  color = DEFAULTS.color,
  className = '',
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const phaseRef = useRef(0);

  const normalizedLevel = Math.min(1, level / 128);

  const draw = useMemo(() => {
    return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);

      if (!isActive) {
        // 非激活状态：微弱的呼吸脉冲
        phaseRef.current += 0.03;
        const breathe = 0.15 + 0.05 * Math.sin(phaseRef.current);
        ctx.fillStyle = color;
        ctx.globalAlpha = breathe;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }

      switch (mode) {
        case 'bars': {
          const barW = (w - 4) / DEFAULTS.barCount;
          const barGap = 1;
          const maxH = h - 8;

          for (let i = 0; i < DEFAULTS.barCount; i++) {
            let barH: number;

            if (frequencyData && frequencyData[i]) {
              barH = (frequencyData[i] / 255) * maxH;
            } else {
              // 模拟频谱：中间高两边低
              const dist = Math.abs(i - DEFAULTS.barCount / 2) / (DEFAULTS.barCount / 2);
              barH = normalizedLevel * maxH * (1 - dist * 0.6) * (0.4 + 0.6 * Math.random());
            }

            ctx.fillStyle = color;
            const x = 2 + i * (barW + barGap);
            const y = h - 4 - barH;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, Math.max(2, barH), 1.5);
            ctx.fill();
          }
          break;
        }

        case 'wave': {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const points = 60;
          const scale = normalizedLevel * (h / 4);
          for (let i = 0; i <= points; i++) {
            const x = (i / points) * w;
            const y = h / 2 + scale * Math.sin((i / points) * Math.PI * 6 + phaseRef.current);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          // 镜像波形
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = color;
          ctx.beginPath();
          for (let i = 0; i <= points; i++) {
            const x = (i / points) * w;
            const y = h / 2 - scale * Math.sin((i / points) * Math.PI * 6 + phaseRef.current + 1);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }

        case 'ring': {
          const centerX = w / 2;
          const centerY = h / 2;
          const maxR = Math.min(w, h) / 2 - 4;
          const r = normalizedLevel * maxR * 0.8 + maxR * 0.2;

          // 外环
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
          ctx.stroke();

          // 内点
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(centerX, centerY, r * 0.25, 0, Math.PI * 2);
          ctx.fill();

          // 脉冲
          const pulseR = r * 1.3 + Math.sin(phaseRef.current * 3) * 3;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.arc(centerX, centerY, pulseR, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
      }
    };
  }, [mode, color, normalizedLevel, frequencyData, isActive]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const animate = () => {
      phaseRef.current += 0.05;
      draw(ctx, width, height);
      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [draw, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={className}
    />
  );
}
