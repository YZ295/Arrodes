/**
 * 工作区路由 v2（多智能体协作工作区 · Phase B1 隔离）
 *
 * GET    /api/v1/workspaces            → 工作区列表（含概览）
 * POST   /api/v1/workspaces            → 创建
 * GET    /api/v1/workspaces/:id        → 详情
 * PATCH  /api/v1/workspaces/:id        → 改名/换图标/归档
 * DELETE /api/v1/workspaces/:id        → 归档（软删除）
 */
import { Router } from 'express';
import { workspaceRepo } from '../db/workspace-repo.js';
import { AgentChatRepository } from '../db/agent-chat-repo.js';
import { agentAdapters } from '../services/agentAdapters.js';
import { dispatchAgentTask } from '../services/agentTasks.js';
import { recordAgentMemory } from '../services/agentMemories.js';
import { repoRoot } from '../services/repoRoot.js';

const chatRepo = new AgentChatRepository();

function isConnectedAgent(workspaceId: string, agentId: string): boolean {
  return workspaceRepo.listMembers(workspaceId).some(
    (m) => m.memberType === 'agent' && m.memberId === agentId,
  );
}

export function createWorkspacesRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      const workspaces = workspaceRepo.list().map((w) => ({
        ...w,
        stats: workspaceRepo.stats(w.id),
      }));
      res.json({ workspaces });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  router.post('/', (req, res) => {
    try {
      const { name, kind, icon } = req.body ?? {};
      if (!name || !String(name).trim()) {
        res.status(400).json({ error: 'name 必填' }); return;
      }
      const ws = workspaceRepo.create({ name: String(name), kind: kind ? String(kind) : undefined, icon: icon ? String(icon) : undefined });
      res.status(201).json({ workspace: ws });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '创建失败' });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({
        workspace: ws,
        stats: workspaceRepo.stats(ws.id),
        members: workspaceRepo.listMembers(ws.id),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // 接入智能体（连线）：memberType 默认 agent
  router.post('/:id/members', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const { memberType, memberId, role } = req.body ?? {};
      const type: 'user' | 'agent' = memberType === 'user' ? 'user' : 'agent';
      if (!memberId || !String(memberId).trim()) {
        res.status(400).json({ error: 'memberId 必填' }); return;
      }
      const member = workspaceRepo.addMember(ws.id, type, String(memberId), role);
      res.status(201).json({ member });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '接入失败' });
    }
  });

  // 断开智能体
  router.delete('/:id/members/:memberId', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      const removed = workspaceRepo.removeMember(ws.id, 'agent', req.params.memberId);
      if (!removed) { res.status(404).json({ error: '该智能体未接入此工作区' }); return; }
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '断开失败' });
    }
  });

  // 与已接入智能体对话（一次性委派，历史拼入任务）
  router.post('/:id/agents/:agentId/chat', async (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
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
        reply = await adapter.run(task, { cwd: repoRoot(), signal: req.signal });
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
  router.get('/:id/agents/:agentId/messages', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({ messages: chatRepo.list(ws.id, req.params.agentId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '查询失败' });
    }
  });

  // 派发任务（高风险语义：客户端先确认再调用；req.signal 支持中止）
  router.post('/:id/agents/:agentId/tasks', async (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
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
        cwd: repoRoot(),
        signal: req.signal,
      });
      res.json({ reply });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '派发任务失败';
      console.error('[AgentTask] 派发失败:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 外部智能体写共享记忆（经 Arrodes 中转，统一格式）
  router.post('/:id/agents/:agentId/memories', (req, res) => {
    try {
      const ws = workspaceRepo.get(req.params.id);
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

  router.patch('/:id', (req, res) => {
    try {
      const { name, icon, status, config } = req.body ?? {};
      const ws = workspaceRepo.update(req.params.id, {
        name: name !== undefined ? String(name) : undefined,
        icon: icon !== undefined ? String(icon) : undefined,
        status,
        config,
      });
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({ workspace: ws });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '更新失败' });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      if (req.params.id === 'default') {
        res.status(400).json({ error: '默认工作区不可归档' }); return;
      }
      const ws = workspaceRepo.archive(req.params.id);
      if (!ws) { res.status(404).json({ error: '工作区不存在' }); return; }
      res.json({ workspace: ws });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : '归档失败' });
    }
  });

  return router;
}
