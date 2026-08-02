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

export class Harness {
  private agents = new Map<string, AgentDefinition>();
  private tasks: TaskRecord[] = [];

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
   * 意图路由。v1 用关键词/规则匹配；后续可升级为 LLM 路由（orchestrator Agent）。
   * 所有对话默认进主对话 Agent；本地指令意图（帮助/静音等）由前端拦截，不走到这里。
   */
  route(_content: string): string {
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

    const retries = options.retries ?? 1;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await agent.run(ctx, input);
        record.status = result.failed ? 'failed' : 'done';
        record.finishedAt = Date.now();
        record.durationMs = record.finishedAt - record.startedAt;
        record.error = result.error;
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
