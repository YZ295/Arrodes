import { AgentChatRepository } from '../db/agent-chat-repo.js';
import type { AgentChatAdapter } from './agentAdapters.js';

export interface DispatchAgentTaskInput {
  workspaceId: string;
  agentId: string;
  task: string;
  adapter: AgentChatAdapter;
  cwd: string;
  signal?: AbortSignal;
  /** 有状态会话键（codex SDK 线程复用） */
  sessionKey?: string;
  /** 工作区权限（default/full，映射 codex sandbox） */
  permission?: 'default' | 'full';
  chatRepo?: AgentChatRepository;
}

export interface BuildAgentChatTaskInput {
  /** 适配器是否原生有状态（codex SDK 为 true，其余为 false） */
  stateful: boolean;
  content: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  agentId: string;
  learnings: string;
}

/**
 * 构造「与智能体对话」的任务文本。
 * - stateful adapter：只带学习注入 + 最新消息（codex 自己记得上下文，不再拼历史）
 * - 非 stateful：保持现状——历史多于一条时拼学习注入 + 完整历史 + 最新消息
 */
export function buildAgentChatTask(input: BuildAgentChatTaskInput): string {
  const { stateful, content, history, agentId, learnings } = input;
  if (!stateful && history.length > 1) {
    const historyText = history
      .map((m) => `${m.role === 'user' ? '用户' : agentId}: ${m.content}`)
      .join('\n');
    return `${learnings ? `【过往研讨会学习（可参考）】\n${learnings}\n\n` : ''}以下是你们之前的对话（按时间顺序）：\n${historyText}\n\n请继续对话，回答用户最新消息。`;
  }
  if (stateful && learnings) {
    return `【过往研讨会学习（可参考）】\n${learnings}\n\n${content}`;
  }
  return content;
}

export async function dispatchAgentTask(_input: DispatchAgentTaskInput): Promise<string> {
  const repo = _input.chatRepo ?? new AgentChatRepository();
  repo.append(_input.workspaceId, _input.agentId, 'user', `【任务】${_input.task}`);
  try {
    const reply = await _input.adapter.run(_input.task, {
      cwd: _input.cwd,
      signal: _input.signal,
      sessionKey: _input.sessionKey,
      permission: _input.permission,
    });
    repo.append(_input.workspaceId, _input.agentId, 'assistant', `【任务结果】${reply}`);
    return reply;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    repo.append(_input.workspaceId, _input.agentId, 'assistant', `【任务结果】失败: ${msg.slice(0, 500)}`);
    throw err;
  }
}
