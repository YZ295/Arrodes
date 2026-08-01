/**
 * 插件管理器
 *
 * 管理插件的生命周期（注册/卸载/激活/停用），
 * 并按序执行钩子链。
 *
 * 使用方式：
 * ```ts
 * const manager = PluginManager.getInstance();
 * manager.register(LoggerPlugin);
 * manager.activate('builtin.logger');
 * ```
 */
import type {
  ArodesPlugin,
  PluginRegistry,
} from '@shared/types/plugin';
import type { Message, MemoryNode } from '@shared/types';
import type { PipelineContext, PipelineResult } from '@shared/types/pipeline';

export class PluginManager implements PluginRegistry {
  private static instance: PluginManager;
  private plugins = new Map<string, ArodesPlugin>();

  static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  private constructor() {
    // 注册内置日志插件
    this.registerBuiltinLogger();
  }

  // ============================================================
  // 基础 CRUD
  // ============================================================

  register(plugin: ArodesPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      console.warn(`[PluginManager] 插件 "${plugin.manifest.id}" 已存在，跳过`);
      return;
    }
    this.plugins.set(plugin.manifest.id, { ...plugin, status: 'installed' });
    console.log(`[PluginManager] 已注册: ${plugin.manifest.id} v${plugin.manifest.version}`);
  }

  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      this.plugins.delete(pluginId);
      console.log(`[PluginManager] 已卸载: ${pluginId}`);
    }
  }

  get(pluginId: string): ArodesPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  list(): ArodesPlugin[] {
    return Array.from(this.plugins.values());
  }

  // ============================================================
  // 生命周期
  // ============================================================

  async activate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`插件 "${pluginId}" 未注册`);
    try {
      await plugin.hooks.onActivate?.();
      plugin.status = 'active';
    } catch (err) {
      plugin.status = 'error';
      plugin.errorMessage = err instanceof Error ? err.message : '激活失败';
      throw err;
    }
  }

  async deactivate(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    try {
      await plugin.hooks.onDeactivate?.();
      plugin.status = 'disabled';
    } catch (err) {
      plugin.status = 'error';
      plugin.errorMessage = err instanceof Error ? err.message : '停用失败';
    }
  }

  // ============================================================
  // 钩子链执行
  // ============================================================

  private activePlugins(): ArodesPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.status === 'active');
  }

  async runBeforeMessageHooks(msg: Message, sessionId: string): Promise<Message | null> {
    let current = msg;
    for (const p of this.activePlugins()) {
      if (!p.hooks.onBeforeMessage) continue;
      try {
        const result = await p.hooks.onBeforeMessage(current, sessionId);
        if (result === null) return null; // 插件拦截了消息
        current = result;
      } catch (err) {
        console.error(`[PluginManager] ${p.manifest.id} onBeforeMessage 异常:`, err);
      }
    }
    return current;
  }

  async runAfterMessageHooks(msg: Message, sessionId: string): Promise<void> {
    for (const p of this.activePlugins()) {
      if (!p.hooks.onAfterMessage) continue;
      try {
        await p.hooks.onAfterMessage(msg, sessionId);
      } catch (err) {
        console.error(`[PluginManager] ${p.manifest.id} onAfterMessage 异常:`, err);
      }
    }
  }

  async runBeforeMemorySaveHooks(memory: MemoryNode): Promise<MemoryNode | null> {
    let current = memory;
    for (const p of this.activePlugins()) {
      if (!p.hooks.onBeforeMemorySave) continue;
      try {
        const result = await p.hooks.onBeforeMemorySave(current);
        if (result === null) return null;
        current = result;
      } catch (err) {
        console.error(`[PluginManager] ${p.manifest.id} onBeforeMemorySave 异常:`, err);
      }
    }
    return current;
  }

  async runAfterMemorySaveHooks(memory: MemoryNode): Promise<void> {
    for (const p of this.activePlugins()) {
      if (!p.hooks.onAfterMemorySave) continue;
      try {
        await p.hooks.onAfterMemorySave(memory);
      } catch (err) {
        console.error(`[PluginManager] ${p.manifest.id} onAfterMemorySave 异常:`, err);
      }
    }
  }

  async runCommandHooks(command: string, args: string[]): Promise<unknown> {
    for (const p of this.activePlugins()) {
      if (!p.hooks.onCommand) continue;
      try {
        const result = await p.hooks.onCommand(command, args);
        if (result !== undefined && result !== null) return result;
      } catch (err) {
        console.error(`[PluginManager] ${p.manifest.id} onCommand 异常:`, err);
      }
    }
    return null; // 没有插件处理该命令
  }

  async runBeforePipelineHooks(ctx: PipelineContext): Promise<void> {
    for (const p of this.activePlugins()) {
      if (!p.hooks.onBeforePipeline) continue;
      try {
        await p.hooks.onBeforePipeline(ctx);
      } catch (err) {
        console.error(`[PluginManager] ${p.manifest.id} onBeforePipeline 异常:`, err);
      }
    }
  }

  async runAfterPipelineHooks(result: PipelineResult): Promise<void> {
    for (const p of this.activePlugins()) {
      if (!p.hooks.onAfterPipeline) continue;
      try {
        await p.hooks.onAfterPipeline(result);
      } catch (err) {
        console.error(`[PluginManager] ${p.manifest.id} onAfterPipeline 异常:`, err);
      }
    }
  }

  // ============================================================
  // 内置插件
  // ============================================================

  private registerBuiltinLogger(): void {
    this.register({
      manifest: {
        id: 'builtin.logger',
        name: '日志插件',
        version: '1.0.0',
        description: '将所有对话消息记录到控制台',
      },
      hooks: {
        onAfterMessage: (msg) => {
          console.log(`[Plugin:Logger] ${msg.role}: ${msg.content.slice(0, 200)}`);
        },
      },
      status: 'installed',
    });
  }
}

/** 获取全局插件管理器单例 */
export function getPluginManager(): PluginManager {
  return PluginManager.getInstance();
}
