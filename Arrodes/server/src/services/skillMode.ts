/**
 * 技能模式（借鉴 DeepSeek Harness 的 Agent Preset 概念）
 *
 * DSH 提供 标准/PTC/创造/极简 四套 Agent 预设，每套是插件（工具/技能）的不同组装。
 * 这里把「模式」映射为阿罗德斯技能组合的运行时切换：
 * - 标准模式：全量技能
 * - PTC 模式：编程聚焦（文件/命令/自改/MCP/网页检索，关闭桌面控制与娱乐技能）
 * - 创造模式：创作与灵感（网页/记忆/天气/朗读，关闭电脑控制与自我修改）
 * - 极简模式：仅对话 + 基础记忆 + 只读文件（关闭所有高风险与联网操作）
 *
 * 与 skillProfile.ts 的区别：profile 是启动时的静态裁剪（文件配置）；
 * 本模块是运行时可切换的模式，切换后即时生效并持久化到 data/skill-mode.json。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllSkills, setSkillEnabled } from '../skills/registry.js';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface SkillMode {
  id: string;
  /** 显示名称（与 DSH 预设名对齐） */
  name: string;
  description: string;
  /** 该模式下禁用的技能（空数组 = 全量启用） */
  disabled: string[];
}

export const SKILL_MODES: SkillMode[] = [
  {
    id: 'standard',
    name: '标准模式',
    description: '功能完整的阿罗德斯：文件、Shell、网页、记忆、桌面与开发工作流全部可用。',
    disabled: [],
  },
  {
    id: 'ptc',
    name: 'PTC 模式',
    description: '编程聚焦：保留文件/命令/自改/MCP/网页检索，关闭桌面控制与娱乐技能。',
    disabled: [
      'minimax_tts', 'get_weather',
      'open_app', 'list_windows', 'focus_window', 'get_foreground', 'close_window',
      'type_text', 'send_hotkey', 'volume_control', 'media_control',
      'clipboard_get', 'clipboard_set', 'screenshot', 'lock_screen', 'system_stats',
      'set_reminder', 'list_reminders', 'cancel_reminder',
    ],
  },
  {
    id: 'creator',
    name: '创造模式',
    description: '创作与灵感：保留网页、记忆、天气与朗读，关闭电脑控制与自我修改。',
    disabled: [
      'exec_command', 'self_modify',
      'write_file', 'create_file', 'delete_file', 'move_file', 'copy_file',
      'open_app', 'list_windows', 'focus_window', 'get_foreground', 'close_window',
      'type_text', 'send_hotkey', 'volume_control', 'media_control',
      'clipboard_get', 'clipboard_set', 'screenshot', 'lock_screen',
      'mcp_call_tool',
      'grill-me', 'to-spec', 'to-tickets', 'implement', 'code-review', 'improve-architecture',
    ],
  },
  {
    id: 'minimal',
    name: '极简模式',
    description: '仅对话与基础记忆：保留记忆检索、时间与只读文件，关闭所有高风险与联网操作。',
    disabled: [
      'exec_command', 'write_file', 'create_file', 'delete_file', 'move_file', 'copy_file',
      'memory_stats', 'memory_list_all', 'memory_cleanup', 'delete_memory',
      'web_search', 'web_fetch', 'web_search_direct', 'open_url',
      'get_weather', 'minimax_tts',
      'set_reminder', 'list_reminders', 'cancel_reminder',
      'open_app', 'list_windows', 'focus_window', 'get_foreground', 'close_window',
      'type_text', 'send_hotkey', 'volume_control', 'media_control',
      'clipboard_get', 'clipboard_set', 'screenshot', 'lock_screen', 'system_stats',
      'mcp_list_tools', 'mcp_call_tool', 'self_modify',
      'grill-me', 'to-spec', 'to-tickets', 'implement', 'code-review', 'improve-architecture',
      'create_session',
    ],
  },
];

const MODE_FILE = process.env.SKILL_MODE_FILE
  ? resolve(process.env.SKILL_MODE_FILE)
  : join(resolve(__dirname, '../data'), 'skill-mode.json');

let _currentModeId = 'standard';

function persistMode(): void {
  try {
    mkdirSync(dirname(MODE_FILE), { recursive: true });
    writeFileSync(MODE_FILE, JSON.stringify({ mode: _currentModeId }, null, 2), 'utf-8');
  } catch {
    // 持久化失败不阻断切换（下次启动回退默认）
  }
}

/** 读取上次持久化的模式（服务启动时调用） */
export function loadPersistedMode(): string {
  try {
    if (existsSync(MODE_FILE)) {
      const json = JSON.parse(readFileSync(MODE_FILE, 'utf-8')) as { mode?: unknown };
      if (typeof json.mode === 'string' && SKILL_MODES.some((m) => m.id === json.mode)) {
        _currentModeId = json.mode;
      }
    }
  } catch {
    // 损坏时保持默认
  }
  return _currentModeId;
}

export function getSkillModes(): SkillMode[] {
  return SKILL_MODES;
}

export function getCurrentMode(): SkillMode {
  return SKILL_MODES.find((m) => m.id === _currentModeId) ?? SKILL_MODES[0];
}

/**
 * 切换技能模式：先全量启用，再按模式禁用清单裁剪，保证组合精确。
 * 自定义技能（custom:*）不在此模式清单内，任何模式都保持启用。
 */
export function setSkillMode(modeId: string): { success: boolean; error?: string } {
  const mode = SKILL_MODES.find((m) => m.id === modeId);
  if (!mode) {
    return { success: false, error: `未知技能模式: ${modeId}` };
  }
  for (const skill of getAllSkills()) {
    setSkillEnabled(skill.name, true);
  }
  for (const name of mode.disabled) {
    setSkillEnabled(name, false);
  }
  _currentModeId = mode.id;
  persistMode();
  console.log(`[SkillMode] 已切换技能模式: ${mode.name}（禁用 ${mode.disabled.length} 项）`);
  return { success: true };
}
