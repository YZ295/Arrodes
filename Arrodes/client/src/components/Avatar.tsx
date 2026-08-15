/**
 * 阿罗德斯头像组件
 *
 * 支持自定义头像：localStorage['arrodes.avatar'] 存 data URL 时优先使用，
 * 否则回退默认形象。ProfilePanel 可上传更换。
 */
import { useState, useEffect } from 'react';
import avatarImg from '../assets/arrodes_avatar.jpg';

interface AvatarProps {
  /** 头像尺寸（px） */
  size?: number;
  /** 是否显示金色光晕（AI 说话时） */
  glow?: boolean;
  /** 是否显示外环光环 */
  showHalo?: boolean;
  className?: string;
}

export default function Avatar({ size = 36, glow = false, showHalo = false, className = '' }: AvatarProps) {
  const [customSrc, setCustomSrc] = useState<string | null>(null);
  useEffect(() => {
    try {
      setCustomSrc(localStorage.getItem('arrodes.avatar'));
    } catch {
      setCustomSrc(null);
    }
  }, []);

  const src = customSrc || avatarImg;

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }}>
      {/* 外环光环（可选） */}
      {showHalo && (
        <div
          className="absolute inset-0 rounded-full border border-[var(--color-home-gold)]/40 animate-pulse"
          style={{ transform: `scale(${1.6})` }}
        />
      )}

      {/* 金色光晕（说话时） */}
      {glow && (
        <div
          className="absolute inset-0 rounded-full bg-[var(--color-home-gold)]/30 blur-md animate-pulse"
        />
      )}

      {/* 头像本体 */}
      <img
        src={src}
        alt="阿罗德斯"
        className="relative rounded-full object-cover border border-[var(--color-home-gold)]/60 shadow-lg"
        style={{
          width: size,
          height: size,
          boxShadow: glow ? '0 0 16px rgba(59, 130, 246, 0.65)' : '0 2px 8px rgba(0,0,0,0.5)',
        }}
        draggable={false}
      />
    </div>
  );
}
