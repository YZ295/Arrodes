/**
 * 工作区 Agent 交互路由（对话/历史/派任务/写记忆）
 * 挂载于 /api/v1/workspaces/:id/agents（mergeParams 取 :id）
 */
import { Router } from 'express';
import { workspaceRepo } from '../db/workspace-repo.js';
import { AgentChatRepository } from '../db/agent-chat-repo.js';
import { agentAdapters } from '../services/agentAdapters.js';
import { dispatchAgentTask } from '../services/agentTasks.js';
import { recordAgentMemory } from '../services/agentMemories.js';
import { resolve } from 'node:path';

const chatRepo = new AgentChatRepository();

function isConnectedAgent(workspaceId: string, agentId: string): boolean {
  return workspaceRepo.listMembers(workspaceId).some(
    (m) => m.memberType === 'agent' && m.memberId === agentId,
  );
}

/** Agent 工作目录：优先工作区配置的 projectDir，其次 ARRODES_REPO_ROOT，最后当前仓库 */
function projectDirOf(ws: { config: Record<string, unknown> }): string {
  const p = ws.config?.projectDir;
  if (typeof p === 'string' && p.trim()) return p;
  return process.env.ARRODES_REPO_ROOT || resolve(process.cwd(), '..', '..');
}

export function createWorkspaceAgentsRouter(): Router {
  const router = Router({ mergeParams: true });

  // 与已接入智能体对话（一次性委派，历史拼入任务）
  router.post('/:agentId/chat', async (req, res) => {
    try {
      const ws = workspaceRepo.get((req.params as Record<string, string>).id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const agentId = req.params.agentId;
      if (!isConnectedAgent(ws.id, agentId)) { res.status(400).json({ error: '该智能体未接入此工作区' }); return; }
      const adapter = agentAdapters.get(agentId);
      if (!adapter) { res.status(400).json({ error: '该智能体暂不支持工作区对话' }); return; }

      const content = String(req.body?.content ?? '').trim();
      if (!content) { res.status(400).json({ error: '消息不能为空' }); return; }

      chatRepo.append(ws.id, agentId, 'user', content);
      const history = chatRepo.list(ws.id, agentId, 12);
      const historyText = history
        .map((m) => `${m.role === 'user' ? '用户' : agentId}: ${m.content}`)
        .join('\n');
      const task = history.length > 1
        ? `以下是你们之前的对话（按时间顺序）：\n${historyText}\n\n请继续对话，回答用户最新消息。`
        : content;

      let reply: string;
      try {
        // 不用 req.signal：POST 长任务下请求体读完 ~3s 会虚假 abort（keep-alive），会误杀子进程。
        // 中止语义由显式 cancel 端点负责（见 /runs/:runId/cancel）。
        reply = await adapter.run(task, { cwd: projectDirOf(ws) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        chatRepo.append(ws.id, agentId, 'assistant', `（对话失败: ${msg.slice(0, 500)}）`);
        throw err;
      }
      chatRepo.append(ws.id, agentId, 'assistant', reply);
      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '对话失败';
      console.error('[AgentChat] 对话失败:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 读取与某智能体的历史对话
  router.get('/:agentId/messages', (req, res) => {
    try {
      const ws = workspaceRepo.get((req.params as Record<string, string>).id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({ messages: chatRepo.list(ws.id, req.params.agentId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // 派发任务（高风险语义：客户端先确认再调用；req.signal 支持中止）
  router.post('/:agentId/tasks', async (req, res) => {
    try {
      const ws = workspaceRepo.get((req.params as Record<string, string>).id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const agentId = req.params.agentId;
      if (!isConnectedAgent(ws.id, agentId)) { res.status(400).json({ error: '该智能体未接入此工作区' }); return; }
      const adapter = agentAdapters.get(agentId);
      if (!adapter) { res.status(400).json({ error: '该智能体暂不支持派发任务' }); return; }

      const task = String(req.body?.task ?? '').trim();
      if (!task) { res.status(400).json({ error: '任务不能为空' }); return; }

      const reply = await dispatchAgentTask({
        workspaceId: ws.id,
        agentId,
        task,
        adapter,
        cwd: projectDirOf(ws),
      });
      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '派发任务失败';
      console.error('[AgentTask] 派发失败:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 外部智能体写共享记忆（经 Arrodes 中转，统一格式）
  router.post('/:agentId/memories', (req, res) => {
    try {
      const ws = workspaceRepo.get((req.params as Record<string, string>).id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const agentId = req.params.agentId;
      if (!isConnectedAgent(ws.id, agentId)) { res.status(400).json({ error: '该智能体未接入此工作区' }); return; }
      const content = String(req.body?.content ?? '').trim();
      if (!content) { res.status(400).json({ error: '内容不能为空' }); return; }
      const memory = recordAgentMemory({
        workspaceId: ws.id,
        agentId,
        content,
        type: req.body?.type,
      });
      res.status(201).json({ memory });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '写入记忆失败' });
    }
  });

  return router;
}
