/**
 * 内置壁纸插件（builtin.wallpaper）
 *
 * 借鉴 DeepSeek Harness「一切皆插件」：能力以插件形态注册到
 * PluginManager，onActivate 预取状态，onCommand 处理
 * /wallpaper list | current | apply <id>。
 */
import type { ArodesPlugin } from '@shared/types/plugin';

const BASE = '/api/v1/wallpaper';

interface WallpaperInfo {
  id: string;
  title: string;
  type: string;
}

interface Overview {
  connected: boolean;
  current: WallpaperInfo | null;
  wallpapers: WallpaperInfo[];
}

async function fetchOverview(): Promise<Overview> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as Overview;
}

export const WallpaperPlugin: ArodesPlugin = {
  manifest: {
    id: 'builtin.wallpaper',
    name: '壁纸插件',
    version: '1.0.0',
    description: '连接 Wallpaper Engine，浏览与切换桌面壁纸',
  },
  hooks: {
    onActivate: async () => {
      try {
        const overview = await fetchOverview();
        console.log(
          `[Plugin:Wallpaper] connected=${overview.connected} current=${overview.current?.title ?? '无'}`,
        );
      } catch {
        // 未连接时静默，UI 层负责降级
      }
    },
    onCommand: async (command, args) => {
      if (command !== 'wallpaper') return null;
      try {
        const overview = await fetchOverview();
        const sub = (args[0] ?? '').toLowerCase();
        if (sub === 'list') {
          if (!overview.connected) return '⚠️ Wallpaper Engine 未安装或未运行';
          if (overview.wallpapers.length === 0) return '没有可用壁纸';
          return overview.wallpapers
            .map((w, i) => `${i + 1}. [${w.id}] ${w.title}（${w.type}）`)
            .join('\n');
        }
        if (sub === 'current') {
          if (!overview.connected) return '⚠️ Wallpaper Engine 未安装或未运行';
          return overview.current
            ? `当前壁纸：[${overview.current.id}] ${overview.current.title}`
            : '当前壁纸不在 workshop 列表内';
        }
        if (sub === 'apply') {
          const id = (args[1] ?? '').trim();
          if (!id) return '请提供壁纸 id（/wallpaper list 查看）';
          const res = await fetch(`${BASE}/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) return `操作失败（${res.status}）：${data.error ?? '未知错误'}`;
          window.dispatchEvent(new CustomEvent('arrodes:wallpaper-changed'));
          return `✅ 已应用壁纸：${id}`;
        }
        return '壁纸插件命令：/wallpaper list | current | apply <id>';
      } catch (err) {
        return `壁纸操作失败：${err instanceof Error ? err.message : '未知错误'}`;
      }
    },
  },
  status: 'installed',
};
