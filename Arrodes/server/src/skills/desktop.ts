/**
 * 桌面操控技能族（Daisy-Voice-Agent / HoloJarvis 借鉴，Windows 适配）
 *
 * 全部经 winops PowerShell 沙箱执行，高风险操作经 actionGate 分级授权
 * （低风险自动执行，高风险生成待确认项，回复「确认/取消」处理）。
 */
import { registerSkill, type SkillArg } from './registry.js';
import { runWinOp, isDesktopToolsEnabled, type WinOp } from '../services/winops.js';
import { classifyAction } from '../services/actionGate.js';
import { resolve } from 'node:path';

function defaultScreenshotDir(): string {
  const base = process.env.DB_PATH || resolve(process.cwd(), 'data');
  return resolve(base, 'screenshots');
}

/** 中文应用名 → winops 可识别的英文别名（winops.ps1 为纯 ASCII，避免编码问题） */
const APP_NAME_ALIASES: Record<string, string> = {
  记事本: 'notepad',
  计算器: 'calc',
  画图: 'mspaint',
  命令提示符: 'cmd',
  终端: 'wt',
  资源管理器: 'explorer',
  谷歌浏览器: 'chrome',
  微软edge: 'msedge',
  微信: 'wechat',
  代码: 'code',
  网易云音乐: 'cloudmusic',
};

function normalizeAppTarget(target: unknown): string {
  const t = String(target ?? '').trim();
  return APP_NAME_ALIASES[t.toLowerCase()] ?? t;
}

function formatResult(op: WinOp, data: unknown): string {
  const d = data as Record<string, unknown> | null;
  switch (op) {
    case 'list-windows': {
      const windows = (d?.windows as Array<Record<string, unknown>> | undefined) ?? [];
      if (windows.length === 0) return '当前没有可见窗口。';
      return windows.map((w) => `- [${String(w.pid)}] ${String(w.process)} — ${String(w.title)}`).join('\n');
    }
    case 'clipboard-get':
      return `剪贴板内容:\n${String(d?.text ?? '')}`;
    case 'screenshot':
      return `截图已保存: ${String(d?.path ?? '')}（${String(d?.sizeBytes ?? 0)} 字节）`;
    case 'system-stats':
      return `CPU ${String(d?.cpuPercent ?? '?')}% | 内存 ${String(d?.memUsedGB ?? '?')}GB / ${String(d?.memTotalGB ?? '?')}GB`;
    case 'get-foreground':
      return `前台窗口: [${String(d?.pid ?? '?')}] ${String(d?.process ?? '')} — ${String(d?.title ?? '')}`;
    default:
      return String(d?.detail ?? JSON.stringify(d ?? {}));
  }
}

interface DesktopSkillSpec {
  name: string;
  description: string;
  args: SkillArg[];
  op: WinOp;
  payload?: (args: Record<string, unknown>) => unknown;
  describe: (args: Record<string, unknown>) => string;
}

const desktopSpecs = new Map<string, DesktopSkillSpec>();

/** 直通执行（确认后调用，绕过门禁） */
export async function executeDesktopAction(
  spec: DesktopSkillSpec,
  args: Record<string, unknown>,
): Promise<string> {
  if (!isDesktopToolsEnabled()) return '桌面操控已关闭（环境变量 DESKTOP_TOOLS=off）';
  const result = await runWinOp(spec.op, spec.payload ? spec.payload(args) : args);
  if (!result.ok) return `操作失败: ${result.error || '未知错误'}`;
  return formatResult(spec.op, result.data);
}

function registerDesktopSkill(spec: DesktopSkillSpec): void {
  desktopSpecs.set(spec.name, spec);
  registerSkill({
    name: spec.name,
    description: spec.description,
    args: spec.args,
    risk: classifyAction(spec.name),
    describe: spec.describe,
    execute: (args) => executeDesktopAction(spec, args),
  });
}

/** 窗口目标参数：数字视为 pid，否则按标题匹配 */
function windowPayload(target: unknown): Record<string, unknown> {
  const t = String(target ?? '').trim();
  return /^\d+$/.test(t) ? { pid: Number(t) } : { title: t };
}

registerDesktopSkill({
  name: 'open_app',
  description: '打开应用或程序。当用户说"打开记事本""启动微信""打开 D:/xx/yy.exe"时使用。',
  args: [
    { name: 'target', type: 'string', required: true, description: '应用名（如 notepad/记事本/微信/code）或完整路径或网址' },
  ],
  op: 'open-app',
  payload: (args) => normalizeAppTarget(args.target),
  describe: (args) => `打开应用 ${String(args.target ?? '')}`,
});

registerDesktopSkill({
  name: 'list_windows',
  description: '列出当前打开的窗口（进程、标题）。当用户说"现在开着什么窗口""列出窗口"时使用。',
  args: [],
  op: 'list-windows',
  describe: () => '列出当前打开的窗口',
});

registerDesktopSkill({
  name: 'focus_window',
  description: '切换/聚焦到某个窗口。当用户说"切到微信""聚焦记事本窗口"时使用。',
  args: [
    { name: 'target', type: 'string', required: true, description: '窗口标题或进程 pid（数字）' },
  ],
  op: 'focus-window',
  payload: (args) => windowPayload(args.target),
  describe: (args) => `切换到窗口 ${String(args.target ?? '')}`,
});

registerDesktopSkill({
  name: 'get_foreground',
  description: '查看当前前台（活动）窗口是什么。',
  args: [],
  op: 'get-foreground',
  describe: () => '查看当前前台窗口',
});

registerDesktopSkill({
  name: 'close_window',
  description: '关闭窗口/应用。当用户说"关掉记事本""关闭微信窗口"时使用。',
  args: [
    { name: 'target', type: 'string', required: true, description: '窗口标题、进程名或 pid（数字）' },
  ],
  op: 'close-window',
  payload: (args) => windowPayload(args.target),
  describe: (args) => `关闭窗口 ${String(args.target ?? '')}`,
});

registerDesktopSkill({
  name: 'type_text',
  description: '向当前前台窗口输入文本。当用户说"帮我打一段字""输入 xxx"时使用（自动粘贴方式，操作前会保存剪贴板）。',
  args: [
    { name: 'text', type: 'string', required: true, description: '要输入的文本' },
  ],
  op: 'type-text',
  payload: (args) => ({ text: String(args.text ?? '') }),
  describe: (args) => `向前台窗口输入文本（${String(args.text ?? '').slice(0, 30)}）`,
});

registerDesktopSkill({
  name: 'send_hotkey',
  description: '发送快捷键组合。当用户说"按 Ctrl+C""按回车""发送 Alt+Tab"时使用。',
  args: [
    { name: 'keys', type: 'string', required: true, description: '快捷键，如 ^c（Ctrl+C）、%{TAB}（Alt+Tab）、{ENTER}、{F5}、^+s（Ctrl+Shift+S）' },
  ],
  op: 'send-hotkey',
  payload: (args) => String(args.keys ?? ''),
  describe: (args) => `发送快捷键 ${String(args.keys ?? '')}`,
});

registerDesktopSkill({
  name: 'volume_control',
  description: '调节系统音量。当用户说"音量调大""静音""音量调到 30"时使用。',
  args: [
    { name: 'action', type: 'string', required: true, description: 'up（调大）/ down（调小）/ mute（静音）/ set（设定数值）' },
    { name: 'value', type: 'number', required: false, description: 'set 时填目标音量 0-100' },
  ],
  op: 'volume',
  payload: (args) => ({ action: String(args.action ?? ''), value: args.value }),
  describe: (args) => `音量操作: ${String(args.action ?? '')}${args.value != null ? ` ${String(args.value)}` : ''}`,
});

registerDesktopSkill({
  name: 'media_control',
  description: '控制媒体播放。当用户说"暂停播放""下一首""上一首"时使用。',
  args: [
    { name: 'action', type: 'string', required: true, description: 'playpause（播放/暂停）/ next（下一首）/ prev（上一首）/ stop（停止）' },
  ],
  op: 'media',
  payload: (args) => String(args.action ?? ''),
  describe: (args) => `媒体操作: ${String(args.action ?? '')}`,
});

registerDesktopSkill({
  name: 'clipboard_get',
  description: '读取剪贴板文本。当用户问"剪贴板里是什么""我刚才复制了什么"时使用。',
  args: [],
  op: 'clipboard-get',
  describe: () => '读取剪贴板文本',
});

registerDesktopSkill({
  name: 'clipboard_set',
  description: '写入剪贴板文本。当用户说"把 xxx 复制到剪贴板"时使用。',
  args: [
    { name: 'text', type: 'string', required: true, description: '要写入剪贴板的文本' },
  ],
  op: 'clipboard-set',
  payload: (args) => ({ text: String(args.text ?? '') }),
  describe: (args) => `写入剪贴板（${String(args.text ?? '').slice(0, 30)}）`,
});

registerDesktopSkill({
  name: 'screenshot',
  description: '截取当前屏幕并保存为 PNG。当用户说"截个图""截屏"时使用。',
  args: [
    { name: 'dir', type: 'string', required: false, description: '保存目录（默认 server/data/screenshots）' },
  ],
  op: 'screenshot',
  payload: (args) => String(args.dir || defaultScreenshotDir()),
  describe: () => '截取当前屏幕',
});

registerDesktopSkill({
  name: 'lock_screen',
  description: '锁定电脑屏幕。当用户说"锁屏""锁定屏幕"时使用。',
  args: [],
  op: 'lock-screen',
  describe: () => '锁定电脑屏幕',
});

registerDesktopSkill({
  name: 'system_stats',
  description: '查看系统状态（CPU 使用率、内存占用）。当用户问"CPU 多少""内存占用""电脑卡不卡"时使用。',
  args: [],
  op: 'system-stats',
  describe: () => '查看系统 CPU/内存状态',
});
