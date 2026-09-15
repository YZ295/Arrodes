/**
 * 程序化原创桌宠角色「小阿」（路线 A）
 *
 * SVG 分层：后发 → 身体 → 头/脸（眼/嘴/腮红/汗滴）→ 前发/呆毛
 * 动画全部代码驱动：
 * - 呼吸/悬浮/呆毛摆动：CSS keyframes
 * - 眨眼：随机间隔的状态机
 * - 口型同步：rAF 读取共享音频电平 → 嘴部 scaleY
 * - 情绪：resolvePetFace(mood) 决定眼/嘴/腮红/汗滴形态
 */

import { useEffect, useRef, useState } from 'react';
import { useAudioLevelStore } from '../shared/stores/useAudioLevelStore';
import { resolvePetFace } from './proceduralFace';
import type { PetTone } from './live2dPet';
import './proceduralPet.css';

const BLINK_INTERVAL_MIN_MS = 2_400;
const BLINK_INTERVAL_MAX_MS = 5_600;
const BLINK_CLOSE_MS = 110;

function randomBlinkInterval(): number {
  return BLINK_INTERVAL_MIN_MS + Math.random() * (BLINK_INTERVAL_MAX_MS - BLINK_INTERVAL_MIN_MS);
}

export default function ProceduralPet({ mood }: { mood: PetTone }) {
  const face = resolvePetFace(mood);
  const [blink, setBlink] = useState(0); // 0 睁眼 1 闭合
  const mouthRef = useRef<SVGEllipseElement | null>(null);

  // 眨眼状态机：随机间隔 → 快速闭合再睁开
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let closing: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(1);
        closing = setTimeout(() => {
          setBlink(0);
          schedule();
        }, BLINK_CLOSE_MS);
      }, randomBlinkInterval());
    };
    schedule();
    return () => {
      clearTimeout(timer);
      if (closing) clearTimeout(closing);
    };
  }, []);

  // 口型同步：rAF 读共享电平（speaking 时 outputLevel 0~255），直接改 SVG 属性避免重渲染
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const audio = useAudioLevelStore.getState();
      const open = audio.mode === 'speaking' ? Math.min(1, audio.outputLevel / 180) : 0;
      if (mouthRef.current) {
        const ry = 5 + open * 16;
        mouthRef.current.setAttribute('ry', ry.toFixed(2));
        mouthRef.current.style.opacity = String(0.35 + open * 0.65);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const eyeOpen = Math.max(0.08, 1 - blink);
  const squeeze = face.eyes === 'squeeze';
  const eyeScaleY = squeeze ? 0.14 : face.eyes === 'half' ? eyeOpen * 0.55 : eyeOpen;
  const moodClass = `procedural-pet--${mood}`;

  return (
    <div className={`procedural-pet ${moodClass}`} data-role="procedural-pet" aria-hidden="true">
      <svg viewBox="0 0 420 600" className="procedural-pet__svg">
        <defs>
          <radialGradient id="pp-cheek" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffb3c0" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffb3c0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pp-hair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#33456b" />
            <stop offset="100%" stopColor="#1f2c47" />
          </linearGradient>
          <linearGradient id="pp-jacket" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#26334e" />
            <stop offset="100%" stopColor="#1a2438" />
          </linearGradient>
        </defs>

        {/* 悬浮组：整体呼吸 + 上下悬浮 */}
        <g className="procedural-pet__float">
          {/* 后发 */}
          <path
            className="procedural-pet__back-hair"
            d="M110 250 Q96 120 210 108 Q324 120 310 250 Q318 330 300 360 L120 360 Q102 330 110 250 Z"
            fill="url(#pp-hair)"
          />

          {/* 身体：小西服 + 围巾 */}
          <g className="procedural-pet__body">
            <path d="M150 388 Q210 362 270 388 L288 560 Q210 584 132 560 Z" fill="url(#pp-jacket)" />
            <path d="M196 376 L210 404 L224 376 L224 470 L210 486 L196 470 Z" fill="#e8f1ff" />
            <path d="M186 372 Q210 392 234 372 L240 388 Q210 412 180 388 Z" fill="#6fa8ff" />
            {/* 手臂 */}
            <path d="M148 398 Q118 440 128 502" stroke="#26334e" strokeWidth="26" strokeLinecap="round" fill="none" />
            <path d="M272 398 Q302 440 292 502" stroke="#26334e" strokeWidth="26" strokeLinecap="round" fill="none" />
          </g>

          {/* 头 */}
          <g className="procedural-pet__head">
            <ellipse cx="210" cy="238" rx="104" ry="98" fill="#ffe3d0" />
            {/* 耳朵 */}
            <ellipse cx="107" cy="244" rx="12" ry="18" fill="#ffe3d0" />
            <ellipse cx="313" cy="244" rx="12" ry="18" fill="#ffe3d0" />

            {/* 腮红 */}
            <ellipse cx="150" cy="272" rx="24" ry="14" fill="url(#pp-cheek)" opacity={face.blush} />
            <ellipse cx="270" cy="272" rx="24" ry="14" fill="url(#pp-cheek)" opacity={face.blush} />

            {/* 眼睛（眨眼 scaleY，squeeze 时变成 ><） */}
            {squeeze ? (
              <>
                <path d="M136 232 l26 10 M162 242 l-26 10" stroke="#2b3a55" strokeWidth="7" strokeLinecap="round" />
                <path d="M258 242 l26 -10 M284 232 l-26 10" stroke="#2b3a55" strokeWidth="7" strokeLinecap="round" />
              </>
            ) : face.eyes === 'happy' ? (
              <>
                <path d="M138 238 q13 -18 26 0" stroke="#2b3a55" strokeWidth="8" strokeLinecap="round" fill="none" />
                <path d="M256 238 q13 -18 26 0" stroke="#2b3a55" strokeWidth="8" strokeLinecap="round" fill="none" />
              </>
            ) : (
              <>
                <g transform={`translate(0 ${(1 - eyeScaleY) * 16})`}>
                  <ellipse cx="151" cy="236" rx="15" ry={22 * eyeScaleY} fill="#20304d" />
                  <ellipse cx="269" cy="236" rx="15" ry={22 * eyeScaleY} fill="#20304d" />
                  <ellipse cx="146" cy="228" rx={5 * eyeScaleY + 1} ry={7 * eyeScaleY + 1} fill="#bcd9ff" opacity={0.9} />
                  <ellipse cx="264" cy="228" rx={5 * eyeScaleY + 1} ry={7 * eyeScaleY + 1} fill="#bcd9ff" opacity={0.9} />
                </g>
                {/* 眉毛 */}
                <path d="M136 202 q15 -8 30 -2" stroke="#3a4a6b" strokeWidth="5" strokeLinecap="round" fill="none" />
                <path d="M254 200 q15 -6 30 2" stroke="#3a4a6b" strokeWidth="5" strokeLinecap="round" fill="none" />
              </>
            )}

            {/* 嘴（口型同步：rAF 改 ry） */}
            {face.mouth === 'smile' && !squeeze && (
              <path d="M188 292 q22 16 44 0" stroke="#a4553f" strokeWidth="6" strokeLinecap="round" fill="none" />
            )}
            {face.mouth === 'flat' && (
              <path d="M192 296 L228 296" stroke="#a4553f" strokeWidth="6" strokeLinecap="round" />
            )}
            {face.mouth === 'wavy' && (
              <path d="M186 296 q10 -8 21 0 q11 8 22 0" stroke="#a4553f" strokeWidth="5.5" strokeLinecap="round" fill="none" />
            )}
            {face.mouth === 'frown' && (
              <path d="M190 302 q20 -14 40 0" stroke="#a4553f" strokeWidth="6" strokeLinecap="round" fill="none" />
            )}
            {face.mouth === 'open' && (
              <ellipse ref={mouthRef} cx="210" cy="298" rx="18" ry={5} fill="#8c3f30" />
            )}

            {/* 汗滴 */}
            {face.sweat && (
              <ellipse className="procedural-pet__sweat" cx="308" cy="206" rx="7" ry="11" fill="#9fd0ff" />
            )}
          </g>

          {/* 前发 + 呆毛 */}
          <g className="procedural-pet__front-hair">
            <path
              d="M112 214 Q118 128 210 118 Q302 128 308 214 Q300 178 268 168 Q286 196 278 206 Q252 160 210 162 Q170 160 148 200 Q150 176 128 178 Q114 188 112 214 Z"
              fill="url(#pp-hair)"
            />
            {/* 呆毛 */}
            <path
              className="procedural-pet__ahoge"
              d="M204 120 Q198 78 232 62 Q214 86 226 112"
              fill="none"
              stroke="#4f7cff"
              strokeWidth="9"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
