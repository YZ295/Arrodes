/**
 * Harness — 多智能体编排层
 *
 * 职责：
 * - Agent 注册表（register / get / list）
 * - 意图路由（route：根据用户输入分发到对应 Agent）
 * - 任务执行（execute：带重试、失败降级、任务日志）
 * - 对话后编排（afterTurn：主对话完成 → 自动调度记忆 Agent）
 *
 * 对应 Agent 开发基准第 11 条：Harness 调度流程、处理任务报错。
 */
import { randomUUID } from 'node:crypto';
import type {
  AgentContext,
  AgentDefinition,
  AgentInput,
  AgentResult,
  TaskRecord,
} from './agent.js';

export type HarnessEvent =
  | { type: 'turn:start'; sessionId: string; agentId: string }
  | { type: 'turn:end'; sessionId: string; agentId: string; failed: boolean }
  | { type: 'turn:error'; sessionId: string; agentId: string; error: string };

type HarnessListener = (event: HarnessEvent) => void;

export class Harness {
  private agents = new Map<string, AgentDefinition>();
  private tasks: TaskRecord[] = [];
  private listeners = new Set<HarnessListener>();

  /** 订阅生命周期事件；返回 disposer（卸载即回滚，借鉴 Cordis 注册即副作用） */
  on(listener: HarnessListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: HarnessEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn('[Harness] 事件监听器异常:', err);
      }
    }
  }

  // ============================================================
  // Agent 注册表
  // ============================================================

  register(agent: AgentDefinition): void {
    if (this.agents.has(agent.id)) {
      console.warn(`[Harness] Agent "${agent.id}" 已注册，覆盖`);
    }
    this.agents.set(agent.id, agent);
    console.log(`[Harness] Agent 已注册: ${agent.id} (${agent.name})`);
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  listAgents(): Array<{ id: string; name: string; description: string; temperature: number; maxTokens: number }> {
    return Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
    }));
  }

  // ============================================================
  // 任务日志（可观测）
  // ============================================================

  getRecentTasks(limit = 20): TaskRecord[] {
    return this.tasks.slice(-limit).reverse();
  }

  private logTask(record: TaskRecord): void {
    this.tasks.push(record);
    if (this.tasks.length > 200) this.tasks.shift();
  }

  // ============================================================
  // 路由：根据用户输入分发 Agent
  // ============================================================

  /**
   * 意图路由（Agent 路由 v1，借鉴技能触发机制）
   *
   * 用关键词/规则匹配把消息分发到专门 Agent：
   * - 开发意图（grill-me/to-spec/to-tickets/implement/code-review/improve-architecture）→ dev
   * - 记忆管理意图（查看/列出记忆）→ memory
   * - 其余 → main（默认兜底）
   *
   * 可回滚：环境变量 HARNESS_ROUTING=off 时关闭路由，全部走 main。
   */
  route(content: string): string {
    // 开关：默认开，可关（回滚点）
    if (process.env.HARNESS_ROUTING === 'off') return 'main';

    const text = content.toLowerCase();
    const devKeywords = [
      'grill-me', 'grill me', 'to-spec', 'to spec', '转成 spec', '转成spec',
      'to-tickets', 'to tickets', '拆任务', '拆 ticket',
      'implement', '实现 t', '开始实现', '按 ticket',
      'code-review', 'code review', '审查代码', 'code review 一下',
      'improve-architecture', 'improve architecture', '优化架构',
    ];
    for (const k of devKeywords) {
      if (text.includes(k)) return 'dev';
    }

    const memoryKeywords = ['查看我的记忆', '列出记忆', '我的记忆', '记忆列表', '查记忆'];
    for (const k of memoryKeywords) {
      if (text.includes(k)) return 'memory';
    }

    return 'main';
  }

  // ============================================================
  // 执行：run + 重试 + 降级 + 日志
  // ============================================================

  async execute(
    agentId: string,
    ctx: AgentContext,
    input: AgentInput,
    options: { retries?: number } = {},
  ): Promise<AgentResult> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { reply: '', failed: true, error: `未知 Agent: ${agentId}` };
    }

    const taskId = randomUUID().slice(0, 8);
    const record: TaskRecord = {
      id: taskId,
      agentId,
      sessionId: ctx.sessionId,
      status: 'running',
      startedAt: Date.now(),
      inputPreview: input.content.slice(0, 40),
    };
    this.logTask(record);
    this.emit({ type: 'turn:start', sessionId: ctx.sessionId, agentId });

    const retries = options.retries ?? 1;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await agent.run(ctx, input);
        record.status = result.failed ? 'failed' : 'done';
        record.finishedAt = Date.now();
        record.durationMs = record.finishedAt - record.startedAt;
        record.error = result.error;
        this.emit({ type: 'turn:end', sessionId: ctx.sessionId, agentId, failed: result.failed ?? false });
        return result;
      } catch (err) {
        lastError = err;
        if (attempt < retries) {
          console.warn(`[Harness] ${agentId} 第 ${attempt + 1} 次执行失败，重试:`, err instanceof Error ? err.message : err);
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    record.status = 'failed';
    record.finishedAt = Date.now();
    record.durationMs = record.finishedAt - record.startedAt;
    record.error = lastError instanceof Error ? lastError.message : String(lastError);
    console.error(`[Harness] ${agentId} 执行失败:`, record.error);
    this.emit({ type: 'turn:error', sessionId: ctx.sessionId, agentId, error: record.error });

    return { reply: '', failed: true, error: record.error };
  }

  /**
   * 对话后编排：主对话完成 → 调度记忆 Agent 提取记忆/更新画像。
   * 失败不阻塞主流程（记忆是增强能力，不是关键路径）。
   */
  async afterTurn(
    ctx: AgentContext,
    userMessage: string,
    aiReply: string,
  ): Promise<void> {
    const memoryAgent = this.agents.get('memory');
    if (!memoryAgent) return;
    try {
      await this.execute('memory', ctx, {
        content: userMessage,
        isVoice: false,
        history: [],
        memories: [],
        aiReply,
      });
    } catch (err) {
      console.warn('[Harness] afterTurn 记忆 Agent 失败（不阻塞主流程）:', err);
    }
  }
}

export const harness = new Harness();
