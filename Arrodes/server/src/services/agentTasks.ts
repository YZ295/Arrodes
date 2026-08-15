import { AgentChatRepository } from '../db/agent-chat-repo.js';
import type { AgentChatAdapter } from './agentAdapters.js';

export interface DispatchAgentTaskInput {
  workspaceId: string;
  agentId: string;
  task: string;
  adapter: AgentChatAdapter;
  cwd: string;
  signal?: AbortSignal;
  chatRepo?: AgentChatRepository;
}

export async function dispatchAgentTask(_input: DispatchAgentTaskInput): Promise<string> {
  const repo = _input.chatRepo ?? new AgentChatRepository();
  repo.append(_input.workspaceId, _input.agentId, 'user', `【任务】${_input.task}`);
  try {
    const reply = await _input.adapter.run(_input.task, {
      cwd: _input.cwd,
      signal: _input.signal,
    });
    repo.append(_input.workspaceId, _input.agentId, 'assistant', `【任务结果】${reply}`);
    return reply;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    repo.append(_input.workspaceId, _input.agentId, 'assistant', `【任务结果】失败: ${msg.slice(0, 500)}`);
    throw err;
  }
}
