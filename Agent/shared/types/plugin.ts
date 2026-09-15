/**
 * 阿罗德斯插件系统协议
 *
 * 参考 AIRI 的 plugin-sdk 设计。
 * 插件可监听消息、记忆、命令等事件，扩展阿罗德斯的能力。
 *
 * 设计原则：
 * - 轻量：只需满足接口即可，不依赖框架
 * - 可组合：多个插件可以串联处理同一个事件
 * - 安全：插件运行在沙箱内（Plan），无法直接访问系统 API
 */
import type { Message, MemoryNode, IntentResult } from './index';
import type { PipelineContext, PipelineResult } from './pipeline';

// ============================================================
// 插件元信息
// ============================================================

/** 插件清单 */
export interface PluginManifest {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 版本号 (semver) */
  version: string;
  /** 作者 */
  author?: string;
  /** 描述 */
  description?: string;
  /** 依赖的其他插件 ID */
  dependencies?: string[];
  /** 最低阿罗德斯版本 */
  minArodesVersion?: string;
}

// ============================================================
// 插件钩子
// ============================================================

/** 插件生命周期钩子 */
export interface PluginHooks {
  /** 插件安装时调用 */
  onInstall?: () => void | Promise<void>;
  /** 插件卸载时调用 */
  onUninstall?: () => void | Promise<void>;
  /** 插件激活时调用 */
  onActivate?: () => void | Promise<void>;
  /** 插件停用时调用 */
  onDeactivate?: () => void | Promise<void>;

  /** 消息发送前拦截（可修改或过滤消息） */
  onBeforeMessage?: (msg: Message, sessionId: string) => Message | null | Promise<Message | null>;
  /** 消息接收后处理 */
  onAfterMessage?: (msg: Message, sessionId: string) => void | Promise<void>;

  /** 记忆保存前拦截 */
  onBeforeMemorySave?: (memory: MemoryNode) => MemoryNode | null | Promise<MemoryNode | null>;
  /** 记忆保存后处理 */
  onAfterMemorySave?: (memory: MemoryNode) => void | Promise<void>;

  /** 命令处理（优先级：先注册先处理，返回非 null 表示已处理） */
  onCommand?: (command: string, args: string[]) => unknown | Promise<unknown>;

  /** 管道开始前 */
  onBeforePipeline?: (ctx: PipelineContext) => void | Promise<void>;
  /** 管道结束后 */
  onAfterPipeline?: (result: PipelineResult) => void | Promise<void>;

  /** 意图检测后 */
  onIntent?: (intent: IntentResult, rawText: string) => IntentResult | null | Promise<IntentResult | null>;
}

// ============================================================
// 插件接口
// ============================================================

/** 插件实例 */
export interface ArodesPlugin {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 插件钩子 */
  hooks: PluginHooks;
  /** 插件状态 */
  status: 'installed' | 'active' | 'disabled' | 'error';
  /** 错误信息（状态为 error 时） */
  errorMessage?: string;
}

// ============================================================
// 插件管理器接口
// ============================================================

export interface PluginRegistry {
  /** 注册插件 */
  register(plugin: ArodesPlugin): void;
  /** 注销插件 */
  unregister(pluginId: string): void;
  /** 获取插件 */
  get(pluginId: string): ArodesPlugin | undefined;
  /** 列出所有插件 */
  list(): ArodesPlugin[];
  /** 激活插件 */
  activate(pluginId: string): Promise<void>;
  /** 停用插件 */
  deactivate(pluginId: string): Promise<void>;

  /** 执行消息前钩子链 */
  runBeforeMessageHooks(msg: Message, sessionId: string): Promise<Message | null>;
  /** 执行消息后钩子链 */
  runAfterMessageHooks(msg: Message, sessionId: string): Promise<void>;
  /** 执行记忆保存前钩子链 */
  runBeforeMemorySaveHooks(memory: MemoryNode): Promise<MemoryNode | null>;
  /** 执行记忆保存后钩子链 */
  runAfterMemorySaveHooks(memory: MemoryNode): Promise<void>;
  /** 执行命令钩子链 */
  runCommandHooks(command: string, args: string[]): Promise<unknown>;
  /** 执行管道前钩子链 */
  runBeforePipelineHooks(ctx: PipelineContext): Promise<void>;
  /** 执行管道后钩子链 */
  runAfterPipelineHooks(result: PipelineResult): Promise<void>;
}

// ============================================================
// 内置插件示例
// ============================================================

/** 日志插件：将所有消息打印到控制台 */
export const LoggerPlugin: ArodesPlugin = {
  manifest: {
    id: 'builtin.logger',
    name: '日志插件',
    version: '1.0.0',
    description: '将所有对话消息记录到控制台',
  },
  hooks: {
    onAfterMessage: (msg) => {
      console.log(`[Logger] ${msg.role}: ${msg.content.slice(0, 100)}`);
    },
    onAfterMemorySave: (memory) => {
      console.log(`[Logger] 记忆已保存: ${memory.content}`);
    },
  },
  status: 'installed',
};
