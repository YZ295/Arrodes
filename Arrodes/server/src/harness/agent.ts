/**
 * Agent 定义（多智能体 Harness 基础）
 *
 * 每个 Agent 是一份"岗位说明书"：
 * - 身份与职责（systemPrompt）
 * - 运行参数（temperature / maxTokens）
 * - 执行逻辑（run）
 *
 * 对应 Agent 开发基准第 11 条（Harness 多智能体协作）与第 2 条（岗位说明书）。
 */
import type { MemoryNode, Message } from '../../../shared/types/index.js';

/** Agent 执行上下文（跨 Agent 共享） */
export interface AgentContext {
  sessionId: string;
  /** 共享状态（如当前模型、画像） */
  state: Record<string, unknown>;
}

/** Agent 输入 */
export interface AgentInput {
  /** 用户原始输入 */
  content: string;
  isVoice: boolean;
  /** 最近历史消息 */
  history: Message[];
  /** 检索到的相关记忆 */
  memories: MemoryNode[];
  /** 用户画像文本（可为空） */
  profile?: string;
  /** 技能系统提示（可为空） */
  skillsPrompt?: string;
  /** AI 回复（afterTurn 场景：记忆 Agent 分析用） */
  aiReply?: string;
  /** 流式回调（主对话 Agent 推送 chunk 给前端） */
  onChunk?: (text: string) => void;
  /** 取消信号（用户停止 → 中断 LLM 流式推理） */
  signal?: AbortSignal;
}

/** Agent 输出 */
export interface AgentResult {
  /** 回复文本 */
  reply: string;
  /** 本轮提取的新记忆 */
  newMemories?: MemoryNode[];
  /** 调用的技能名 */
  toolCalls?: string[];
  /** 是否失败（已降级） */
  failed?: boolean;
  error?: string;
}

/** Agent 定义（岗位说明书） */
export interface AgentDefinition {
  /** 唯一 ID（如 'main'、'memory'） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 能力描述（供路由/展示） */
  description: string;
  /** 采样温度（按岗位：严谨岗低、创意岗高） */
  temperature: number;
  /** 单次最大输出 token */
  maxTokens: number;
  /** 岗位说明书（System Prompt） */
  systemPrompt?: string;
  /** 执行逻辑 */
  run: (ctx: AgentContext, input: AgentInput) => Promise<AgentResult>;
}

/** 任务记录（可观测） */
export interface TaskRecord {
  id: string;
  agentId: string;
  sessionId: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  error?: string;
  inputPreview?: string;
}
