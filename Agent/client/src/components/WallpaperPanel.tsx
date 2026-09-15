/**
 * 壁纸面板（Wallpaper Engine 插件）
 *
 * 缩略图网格：当前壁纸高亮、点击应用、失败显示可读错误、
 * 未连接时给出提示。应用成功后广播 arrodes:wallpaper-changed
 * 让背景层刷新。
 */
import { memo, useCallback, useEffect, useState } from 'react';

export interface WallpaperInfo {
  id: string;
  title: string;
  previewUrl: string;
  tags: string[];
  type: string;
}

interface Overview {
  connected: boolean;
  current: WallpaperInfo | null;
  wallpapers: WallpaperInfo[];
}

function WallpaperCard({
  item,
  active,
  applying,
  onClick,
}: {
  item: WallpaperInfo;
  active: boolean;
  applying: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={applying}
      className={`group relative w-full aspect-video rounded-xl overflow-hidden border text-left transition-all
        ${active
          ? 'border-blue-400/80 ring-2 ring-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.25)]'
          : 'border-white/10 hover:border-blue-400/40 hover:shadow-[0_0_14px_rgba(59,130,246,0.15)]'}`}
    >
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-white/25 text-3xl">🖼</div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
      {active && (
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[11px] font-medium shadow">
          当前
        </span>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5">
        <p className="text-[12px] text-white/90 truncate">{item.title}</p>
        <p className="text-[11px] text-white/40 truncate">{item.type}</p>
      </div>
      {applying && (
        <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
          <span className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </button>
  );
}

export default memo(function WallpaperPanel({ onBack }: { onBack: () => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/wallpaper');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOverview((await res.json()) as Overview);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载壁纸列表失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (id: string) => {
    setApplyingId(id);
    setError('');
    try {
      const res = await fetch('/api/v1/wallpaper/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await load();
      window.dispatchEvent(new CustomEvent('arrodes:wallpaper-changed'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '应用壁纸失败');
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
        <button
          onClick={onBack}
          className="text-white/40 hover:text-white transition-colors text-sm flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <span className="text-sm font-medium text-white/60">壁纸 · Wallpaper Engine</span>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!overview && !error && (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-full aspect-video rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {overview && !overview.connected && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-3 text-2xl">
              🖼
            </div>
            <h3 className="text-white/70 font-medium mb-1">未连接 Wallpaper Engine</h3>
            <p className="text-sm text-white/35 max-w-[260px]">
              启动 Wallpaper Engine 后自动连接；也可在服务端设置
              ARRODES_WE_INSTALL / ARRODES_WE_WORKSHOP 指定安装位置。
            </p>
          </div>
        )}

        {overview && overview.connected && (
          <>
            <div className="flex items-center gap-2 text-sm text-white/50">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              已连接
              {overview.current && <span className="text-white/70">· 当前：{overview.current.title}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {overview.wallpapers.map((w) => (
                <WallpaperCard
                  key={w.id}
                  item={w}
                  active={overview.current?.id === w.id}
                  applying={applyingId === w.id}
                  onClick={() => void apply(w.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
