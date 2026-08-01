/**
 * 可折叠侧边栏
 *
 * 导航项（第一性原理补充了记忆和视觉）：
 * 1. 对话      — 主对话视图（星球+字幕）
 * 2. 工作流    — 待开发（n8n/coze 集成）
 * 3. 人物画像  — 阿罗德斯角色设定 + 愚者形象
 * 4. 记忆      — 记忆库浏览/搜索/删除
 * 5. 视觉      — Qwen3-VL 视觉理解
 * 6. 配置      — TTS/模型/音色设置
 * 7. 移动端    — 待开发
 * 8. 高级      — API Key/调试/管道配置
 */
import { memo } from 'react';

export type SidebarView =
  | 'conversation' | 'workflow' | 'profile' | 'memory'
  | 'vision' | 'skills' | 'settings' | 'mobile' | 'advanced';

interface NavItem {
  id: SidebarView;
  label: string;
  icon: string;
  available: boolean;
  hint?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'conversation', label: '对话', icon: 'M', available: true },
  { id: 'skills', label: '技能', icon: 'T', available: true },
  { id: 'workflow', label: '工作流', icon: 'W', available: false, hint: '即将支持 n8n / Coze' },
  { id: 'profile', label: '画像', icon: 'P', available: true },
  { id: 'memory', label: '记忆', icon: 'R', available: true },
  { id: 'vision', label: '视觉', icon: 'V', available: true },
  { id: 'settings', label: '配置', icon: 'S', available: true },
  { id: 'mobile', label: '移动端', icon: 'D', available: false, hint: '待开发' },
  { id: 'advanced', label: '高级', icon: 'A', available: true },
];

interface SidebarProps {
  currentView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export default memo(function Sidebar({ currentView, onViewChange, collapsed, onToggle }: SidebarProps) {
  return (
    <div className={`relative z-40 h-full transition-all duration-300 ${
      collapsed ? 'w-14' : 'w-52'
    } bg-black/40 backdrop-blur-xl border-r border-white/5 flex flex-col`}>
      {/* 折叠按钮 */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-6 z-50 w-6 h-6 rounded-full bg-black/60 border border-white/10
          flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
        title={collapsed ? '展开' : '折叠'}
      >
        <svg className={`w-3 h-3 transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Logo / 标题 */}
      <div className="px-4 py-5 flex items-center gap-2 overflow-hidden">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-amber-700
          flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
          <span className="text-[10px] font-bold text-black">F</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-white/90 truncate">阿罗德斯</span>
            <span className="text-[9px] text-white/30 truncate">虚空之镜</span>
          </div>
        )}
      </div>

      {/* 导航项 */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => item.available && onViewChange(item.id)}
              disabled={!item.available}
              title={collapsed ? item.label : undefined}
              className={`group relative flex items-center gap-3 rounded-lg transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              } ${
                active
                  ? 'bg-white/10 text-white'
                  : item.available
                    ? 'text-white/40 hover:text-white/80 hover:bg-white/5'
                    : 'text-white/15 cursor-not-allowed'
              }`}
            >
              {/* 激活指示条 */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-amber-400" />
              )}

              {/* 图标 */}
              <span className={`w-5 h-5 shrink-0 flex items-center justify-center text-[11px] font-mono ${
                active ? 'text-amber-400' : ''
              }`}>
                {item.icon}
              </span>

              {/* 文字 */}
              {!collapsed && (
                <span className="text-xs font-medium truncate flex-1 text-left">{item.label}</span>
              )}

              {/* 不可用标记 */}
              {!item.available && !collapsed && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-white/5 text-white/20 shrink-0">
                  {item.hint || '待开发'}
                </span>
              )}

              {/* 不可用标记（折叠态） */}
              {!item.available && collapsed && (
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/10" />
              )}
            </button>
          );
        })}
      </nav>

      {/* 底部状态 */}
      <div className="px-3 py-3 border-t border-white/5">
        <div className={`flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          {!collapsed && <span className="text-[10px] text-white/30">在线</span>}
        </div>
      </div>
    </div>
  );
});
