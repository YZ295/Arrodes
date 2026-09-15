/**
 * 壁纸背景层（Wallpaper Engine 插件）
 *
 * 把当前 WE 壁纸预览作为主区域背景：cover 裁切 + 暗色遮罩，
 * 加载失败 / 未连接时返回 null（露出原有黑底），不阻塞对话。
 */
import { memo, useCallback, useEffect, useState } from 'react';

interface WallpaperInfo {
  id: string;
  title: string;
  previewUrl: string;
}

interface Overview {
  connected: boolean;
  current: WallpaperInfo | null;
}

export default memo(function WallpaperBackground() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/wallpaper');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Overview;
      setPreviewUrl(data.connected && data.current ? data.current.previewUrl : null);
      setFailed(false);
    } catch {
      setPreviewUrl(null);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener('arrodes:wallpaper-changed', load);
    return () => window.removeEventListener('arrodes:wallpaper-changed', load);
  }, [load]);

  if (!previewUrl || failed) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <img
        src={previewUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onError={() => setFailed(true)}
      />
      {/* 暗色遮罩：保证字幕/输入区可读，同时保留壁纸氛围 */}
      <div className="absolute inset-0 bg-[#050608]/45" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#050608]/65 via-transparent to-[#050608]/80" />
    </div>
  );
});
