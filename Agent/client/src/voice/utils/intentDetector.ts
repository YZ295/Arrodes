/**
 * 客户端意图检测器
 *
 * Phase 0 — 纯关键词/正则匹配，在消息发送到服务端前拦截。
 * Phase 1 后将由 AI 服务端返回精确的 IntentResult，本模块退化为后备/兜底。
 */

import type { IntentType, IntentResult } from '@shared/types';

// ---- 模式定义 ----

interface IntentPattern {
  type: IntentType;
  /** 匹配正则（大小写不敏感） */
  patterns: RegExp[];
  /** 参数提取器，返回 Record<string, unknown> */
  extractParams?: (match: RegExpExecArray) => Record<string, unknown>;
  /** 置信度加成（默认 0.3，命中关键词 +0.5） */
  baseScore: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  // --- 纯本地 ---
  {
    type: 'help',
    patterns: [
      /^(帮助|help|命令|功能|你能做什么|怎么用)\s*[?？。.]?\s*$/i,
      /^show\s+(help|commands)$/i,
    ],
    baseScore: 0.9,
  },
  {
    type: 'mute',
    patterns: [
      /^(静音|闭嘴|mute|安静|别说话)\s*[!！。.]?\s*$/i,
      /^(取消静音|unmute|开麦|解除静音)\s*[!！。.]?\s*$/i,
    ],
    baseScore: 0.85,
  },

  // --- 事件驱动（需要外部模块执行 REST） ---
  {
    type: 'new_session',
    patterns: [
      /^(新建|创建|打开|新)(会话|对话|聊天|session)\s*(.*)?$/i,
      /^(create|new)\s+(session|chat|conversation)\s*(.*)?$/i,
      /^我想(聊|讨论|说|问)(.*)$/i,
    ],
    extractParams: (m) => {
      // 尝试从剩余文本提取标题
      const title = (m[3] || m[2] || '').trim() || undefined;
      return title ? { title } : {};
    },
    baseScore: 0.7,
  },
  {
    type: 'switch_session',
    patterns: [
      /^(切换到|切换|打开|进入|去)(会话|对话|聊天)?\s*(.*)$/i,
      /^(switch|open|go\s+to)\s+(session|chat)?\s*(.*)$/i,
      /^看(一下|看)?第\s*(\d+)\s*(个|条)?(会话|对话|聊天)?/i,
    ],
    extractParams: (m) => {
      // 提取目标标识：可能是标题关键词或序号
      const target = (m[3] || m[4] || m[2] || '').trim();
      return target ? { target } : {};
    },
    baseScore: 0.65,
  },
  {
    type: 'delete_session',
    patterns: [
      /^(删除|移除|删掉|丢掉|销毁)(会话|对话|聊天|这个)?\s*(.*)?$/i,
      /^(delete|remove|destroy)\s+(session|chat|this)?\s*(.*)?$/i,
    ],
    extractParams: (m) => {
      const target = (m[3] || m[2] || '').trim();
      return target ? { target } : {};
    },
    baseScore: 0.7,
  },
  {
    type: 'rename_session',
    patterns: [
      /^(重命名|改名|改名为|改叫|rename)\s*(会话|对话|聊天|这个)?\s*(.*)$/i,
      /^把.*(改名为?|叫|重命名(为)?)\s*(.*)$/i,
    ],
    extractParams: (m) => {
      const name = (m[3] || m[4] || '').trim();
      return name ? { name } : {};
    },
    baseScore: 0.65,
  },

  // --- 透传服务端 ---
  {
    type: 'search_memory',
    patterns: [
      /^(搜索|查找|找|查|search|find)\s+(记忆|回忆|之前|历史|关于)\s*(.*)$/i,
      /^(我记得|之前说过|以前).*$/i,
    ],
    extractParams: (m) => {
      const query = (m[3] || m[2] || '').trim();
      return query ? { query } : {};
    },
    baseScore: 0.6,
  },
  {
    type: 'summarize',
    patterns: [
      /^(总结|概括|摘要|汇总|summarize|summary)\s*(.*)$/i,
      /^(太长|太长了|不想看了|说重点)/i,
      /^给(我)?(总结|概括|摘要)(一下)?/i,
    ],
    baseScore: 0.75,
  },
  {
    type: 'clear_context',
    patterns: [
      /^(清空|清除|重置|清理|clear|reset)\s*(上下文|context|记忆|历史|对话)?\s*$/i,
      /^(重新开始|从头开始|restart)/i,
    ],
    baseScore: 0.7,
  },
];

// ---- 检测核心 ----

export interface DetectionResult {
  matched: boolean;
  intent?: IntentResult;
}

/**
 * 对用户输入进行意图检测
 * @param content 用户消息文本
 * @returns 检测结果
 */
export function detectIntent(content: string): DetectionResult {
  for (const pattern of INTENT_PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = regex.exec(content);
      if (match) {
        const params = pattern.extractParams ? pattern.extractParams(match) : {};
        return {
          matched: true,
          intent: {
            type: pattern.type,
            params,
            confidence: pattern.baseScore,
          },
        };
      }
    }
  }

  return { matched: false };
}

/**
 * 判断该意图是否为纯本地可处理类型（无需发往服务端）
 */
export function isLocalOnlyIntent(type: IntentType): boolean {
  return type === 'help' || type === 'mute';
}

/**
 * 判断该意图是否需要通过 EventBus 事件驱动其他模块
 */
export function isEventDrivenIntent(type: IntentType): boolean {
  return (
    type === 'new_session' ||
    type === 'switch_session' ||
    type === 'delete_session' ||
    type === 'rename_session'
  );
}

/**
 * 获取意图的中文提示回复（用于本地处理时展示）
 */
export function getIntentLocalReply(type: IntentType, _params?: Record<string, unknown>): string | null {
  switch (type) {
    case 'help':
      return '**可用命令**\n\n'
        + '- 新建/切换/删除/重命名会话\n'
        + '- 搜索记忆 / 总结 / 清空上下文\n'
        + '- 静音 / 取消静音\n'
        + '- 帮助';
    case 'mute': {
      // 简单检测：如果消息含"取消""unmute""开麦"则视为取消静音
      return null; // 静音无文本回复，仅 UI 状态变更
    }
    default:
      return null;
  }
}
