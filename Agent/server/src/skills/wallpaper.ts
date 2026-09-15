/**
 * Wallpaper Engine 控制技能（壁纸插件）
 *
 * 子命令：
 * - list：列出 workshop 全部壁纸
 * - current：查看当前壁纸
 * - apply：应用指定壁纸（id 来自 list）
 *
 * apply 属高风险（改变桌面壁纸），走 actionGate 授权。
 */
import { registerSkill } from './registry.js';
import {
  WallpaperEngine,
  WallpaperError,
} from '../services/wallpaperEngine.js';

const engine = new WallpaperEngine();

registerSkill({
  name: 'wallpaper',
  description:
    '控制 Wallpaper Engine 壁纸。子命令：list 列出所有可用壁纸；current 查看当前壁纸；apply 应用指定壁纸（参数 id 来自 list）。当用户说"换壁纸""壁纸列表""当前是什么壁纸""把壁纸换成..."时使用。',
  args: [
    { name: 'action', type: 'string', required: true, description: 'list | current | apply' },
    { name: 'id', type: 'string', required: false, description: 'apply 时的壁纸 id' },
  ],
  risk: 'high',
  describe: (args) => `应用 Wallpaper Engine 壁纸：${String(args.id ?? '')}`,
  execute: async (args) => {
    const action = String(args.action ?? '').trim().toLowerCase();
    try {
      switch (action) {
        case 'list': {
          const overview = engine.getOverview();
          if (!overview.connected) return '⚠️ Wallpaper Engine 未安装或未运行';
          if (overview.wallpapers.length === 0) return '没有可用壁纸';
          const lines = overview.wallpapers.map(
            (w, i) => `${i + 1}. [${w.id}] ${w.title}（${w.type}）`,
          );
          return `可用壁纸（${overview.wallpapers.length} 个）：\n${lines.join('\n')}`;
        }
        case 'current': {
          const overview = engine.getOverview();
          if (!overview.connected) return '⚠️ Wallpaper Engine 未安装或未运行';
          if (!overview.current) return '当前壁纸不在 workshop 列表内';
          return `当前壁纸：[${overview.current.id}] ${overview.current.title}`;
        }
        case 'apply': {
          const id = String(args.id ?? '').trim();
          if (!id) return '请提供壁纸 id（可用 list 查看）';
          await engine.apply(id);
          return `✅ 已应用壁纸：${id}`;
        }
        default:
          return 'wallpaper 子命令：list / current / apply <id>';
      }
    } catch (err) {
      if (err instanceof WallpaperError) {
        return `操作失败（${err.status}）：${err.message}`;
      }
      return `操作失败：${err instanceof Error ? err.message : '未知错误'}`;
    }
  },
});
