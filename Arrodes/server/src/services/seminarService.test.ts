import { describe, it, expect, beforeEach } from 'vitest';
import { closeDb, setDbPathForTests } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { SeminarRepository } from '../db/seminar-repo.js';
import { workspaceMemoryHub } from '../workspace/memory-hub.js';
import { workspaceRepo } from '../db/workspace-repo.js';
import { runSeminar, buildSeminarPrompt, injectLearnings, parseLearnings } from './seminarService.js';
import type { AgentChatAdapter } from './agentAdapters.js';
import type { SeminarRepository as SeminarRepoType } from '../db/seminar-repo.js';
import type { LlmService } from './llmService.js';

describe('buildSeminarPrompt', () => {
  it('包含主题、自身角色与完整已发生对话', () => {
    const prompt = buildSeminarPrompt({
      topic: '画布架构',
      self: 'codex',
      other: 'hermes',
      transcript: [
        { speaker: 'codex', content: '我认为节点即状态' },
      ],
      learnings: '过往结论：画布即状态层',
    });
    expect(prompt).toContain('画布架构');
    expect(prompt).toContain('codex');
    expect(prompt).toContain('我认为节点即状态');
    expect(prompt).toContain('过往结论：画布即状态层');
  });
});

describe('parseLearnings', () => {
  it('兼容加粗 Markdown 四段格式', () => {
    const parsed = parseLearnings('**结论**：双方一致\n\n**新知识**：事件溯源\n\n**分歧**：同步方式\n\n**行动项**：设计接口');
    expect(parsed.conclusion).toBe('双方一致');
    expect(parsed.newKnowledge).toBe('事件溯源');
    expect(parsed.disagreement).toBe('同步方式');
    expect(parsed.actionItems).toBe('设计接口');
  });

  it('兼容纯文本四段格式', () => {
    const parsed = parseLearnings('结论：A\n新知识：B\n分歧：C\n行动项：D');
    expect(parsed.conclusion).toBe('A');
    expect(parsed.actionItems).toBe('D');
  });
});

describe('runSeminar（多 Agent 互相对话学习）', () => {
  const calls: Array<{ id: string; task: string }> = [];
  const adapter = (id: string): AgentChatAdapter => ({
    run: async (task) => {
      calls.push({ id, task });
      return `${id} 的回应 #${calls.filter((c) => c.id === id).length}`;
    },
  });

  const llm: Pick<LlmService, 'summarizeText'> = {
    summarizeText: async () => '结论：X\n新知识：Y\n分歧：Z\n行动项：W',
  };

  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
    workspaceRepo.create({ name: '测试工作区' }); // id 随机，外键依赖
    calls.length = 0;
  });

  it('A/B 轮流对话指定轮数并逐条落库', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: '画布架构', agentA: 'codex', agentB: 'hermes', rounds: 2,
    });

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: '画布架构',
      agentA: 'codex',
      agentB: 'hermes',
      rounds: 2,
      adapters: { codex: adapter('codex'), hermes: adapter('hermes') },
      cwd: 'E:/x',
      repo,
      llm,
      memoryHub: workspaceMemoryHub,
    });

    // 2 轮 × 双方各一次 = 4 次调用
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.id)).toEqual(['codex', 'hermes', 'codex', 'hermes']);
    // 第二轮应携带第一轮完整对话
    expect(calls[2].task).toContain('codex 的回应 #1');
    expect(calls[2].task).toContain('hermes 的回应 #1');

    const msgs = repo.messages(seminar.id);
    expect(msgs).toHaveLength(4);
    expect(msgs.map((m) => m.speaker)).toEqual(['codex', 'hermes', 'codex', 'hermes']);

    const finished = repo.get(seminar.id);
    expect(finished?.status).toBe('done');
    expect(finished?.summary).toContain('结论：X');

    // 学习小结写入全量共享记忆（来源标记 seminar:codex-hermes）
    const memories = workspaceMemoryHub.search('结论', 10, ws.id);
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0].sourceAgent).toBe('seminar:codex-hermes');
    expect(memories[0].content).toContain('新知识：Y');
  });

  it('适配器失败时研讨会标记 failed 且已发言保留', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: 'x', agentA: 'codex', agentB: 'hermes', rounds: 1,
    });
    const broken: AgentChatAdapter = {
      run: async () => { throw new Error('agent down'); },
    };

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: 'x',
      agentA: 'codex',
      agentB: 'hermes',
      rounds: 1,
      adapters: { codex: broken, hermes: adapter('hermes') },
      cwd: 'E:/x',
      repo,
      llm,
      memoryHub: workspaceMemoryHub,
    });

    expect(result.status).toBe('failed');
    expect(repo.get(seminar.id)?.status).toBe('failed');
    expect(repo.messages(seminar.id)).toHaveLength(0);
  });

  it('对话完成但学习提炼失败时保留对话并写降级记录', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: 'x', agentA: 'codex', agentB: 'hermes', rounds: 1,
    });
    const failingLlm: Pick<LlmService, 'summarizeText'> = {
      summarizeText: async () => { throw new Error('llm down'); },
    };

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: 'x',
      agentA: 'codex',
      agentB: 'hermes',
      rounds: 1,
      adapters: { codex: adapter('codex'), hermes: adapter('hermes') },
      cwd: 'E:/x',
      repo,
      llm: failingLlm,
      memoryHub: workspaceMemoryHub,
    });

    expect(result.status).toBe('done');
    expect(repo.messages(seminar.id)).toHaveLength(2);
    expect(repo.get(seminar.id)?.summary).toContain('提炼失败');
    const memories = workspaceMemoryHub.search('提炼失败', 10, ws.id);
    expect(memories.length).toBeGreaterThan(0);
  });

  it('提炼首次返回空时自动换措辞重试', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: 'x', agentA: 'codex', agentB: 'hermes', rounds: 1,
    });
    let calls = 0;
    const flakyLlm: Pick<LlmService, 'summarizeText'> = {
      summarizeText: async () => {
        calls++;
        return calls === 1 ? '' : '结论：重试成功\n新知识：略\n分歧：无\n行动项：落地';
      },
    };

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: 'x',
      agentA: 'codex',
      agentB: 'hermes',
      rounds: 1,
      adapters: { codex: adapter('codex'), hermes: adapter('hermes') },
      cwd: 'E:/x',
      repo,
      llm: flakyLlm,
      memoryHub: workspaceMemoryHub,
    });

    expect(calls).toBeGreaterThan(1);
    expect(result.status).toBe('done');
    expect(repo.get(seminar.id)?.summary).toContain('重试成功');
  });

  it('提炼请求显式关闭思考模式（thinkingDisabled），避免推理吃光预算', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: 'x', agentA: 'codex', agentB: 'hermes', rounds: 1,
    });
    let seenOpts: unknown = null;
    const spyLlm: Pick<LlmService, 'summarizeText'> = {
      summarizeText: async (_msgs, opts) => {
        seenOpts = opts;
        return '结论：ok\n新知识：ok\n分歧：无\n行动项：落地';
      },
    };

    await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: 'x',
      agentA: 'codex',
      agentB: 'hermes',
      rounds: 1,
      adapters: { codex: adapter('codex'), hermes: adapter('hermes') },
      cwd: 'E:/x',
      repo,
      llm: spyLlm,
      memoryHub: workspaceMemoryHub,
    });

    expect((seenOpts as { thinkingDisabled?: boolean })?.thinkingDisabled).toBe(true);
    expect((seenOpts as { maxTokens?: number })?.maxTokens).toBeGreaterThanOrEqual(1024);
  });
});

describe('injectLearnings', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
    const ws = workspaceRepo.create({ name: '测试工作区' });
    workspaceMemoryHub.add({
      workspaceId: ws.id,
      sourceAgent: 'seminar:codex-hermes',
      content: '结论：画布即状态层\n行动项：引入 jarvis-hub',
    });
    workspaceMemoryHub.add({
      workspaceId: ws.id,
      sourceAgent: 'codex',
      content: '日常记录',
    });
  });

  it('只注入研讨会沉淀的学习（按工作区隔离、最多 3 条）', () => {
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const injected = injectLearnings(ws.id, 'codex');
    expect(injected).toContain('画布即状态层');
    expect(injected).not.toContain('日常记录');
  });

  it('其他工作区不注入', () => {
    expect(injectLearnings('ws-other', 'codex')).toBe('');
  });
});
