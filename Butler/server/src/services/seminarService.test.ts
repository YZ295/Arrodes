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
      others: ['workbuddy'],
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

  it('解析第五段「裁决」', () => {
    const parsed = parseLearnings('结论：A\n新知识：B\n分歧：C\n行动项：D\n裁决：倾向于 A');
    expect(parsed.arbitration).toBe('倾向于 A');
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
      workspaceId: ws.id, topic: '画布架构', participants: ['codex', 'workbuddy'], rounds: 2,
    });

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: '画布架构',
      participants: ['codex', 'workbuddy'],
      rounds: 2,
      adapters: { codex: adapter('codex'), workbuddy: adapter('workbuddy') },
      cwd: 'E:/x',
      repo,
      llm,
      memoryHub: workspaceMemoryHub,
    });

    // 2 轮 × 双方各一次 = 4 次调用
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.id)).toEqual(['codex', 'workbuddy', 'codex', 'workbuddy']);
    // 第二轮应携带第一轮完整对话
    expect(calls[2].task).toContain('codex 的回应 #1');
    expect(calls[2].task).toContain('workbuddy 的回应 #1');

    const msgs = repo.messages(seminar.id);
    expect(msgs).toHaveLength(4);
    expect(msgs.map((m) => m.speaker)).toEqual(['codex', 'workbuddy', 'codex', 'workbuddy']);

    const finished = repo.get(seminar.id);
    expect(finished?.status).toBe('done');
    expect(finished?.summary).toContain('结论：X');

    // 学习小结写入全量共享记忆（来源标记 seminar:codex-workbuddy）
    const memories = workspaceMemoryHub.search('结论', 10, ws.id);
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0].sourceAgent).toBe('seminar:codex-workbuddy');
    expect(memories[0].content).toContain('新知识：Y');
  });

  it('适配器失败时研讨会标记 failed 且已发言保留', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: 'x', participants: ['codex', 'workbuddy'], rounds: 1,
    });
    const broken: AgentChatAdapter = {
      run: async () => { throw new Error('agent down'); },
    };

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: 'x',
      participants: ['codex', 'workbuddy'],
      rounds: 1,
      adapters: { codex: broken, workbuddy: adapter('workbuddy') },
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
      workspaceId: ws.id, topic: 'x', participants: ['codex', 'workbuddy'], rounds: 1,
    });
    const failingLlm: Pick<LlmService, 'summarizeText'> = {
      summarizeText: async () => { throw new Error('llm down'); },
    };

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: 'x',
      participants: ['codex', 'workbuddy'],
      rounds: 1,
      adapters: { codex: adapter('codex'), workbuddy: adapter('workbuddy') },
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
      workspaceId: ws.id, topic: 'x', participants: ['codex', 'workbuddy'], rounds: 1,
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
      participants: ['codex', 'workbuddy'],
      rounds: 1,
      adapters: { codex: adapter('codex'), workbuddy: adapter('workbuddy') },
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
      workspaceId: ws.id, topic: 'x', participants: ['codex', 'workbuddy'], rounds: 1,
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
      participants: ['codex', 'workbuddy'],
      rounds: 1,
      adapters: { codex: adapter('codex'), workbuddy: adapter('workbuddy') },
      cwd: 'E:/x',
      repo,
      llm: spyLlm,
      memoryHub: workspaceMemoryHub,
    });

    expect((seenOpts as { thinkingDisabled?: boolean })?.thinkingDisabled).toBe(true);
    expect((seenOpts as { maxTokens?: number })?.maxTokens).toBeGreaterThanOrEqual(1024);
  });

  it('三方研讨会：3 个 agent 按序轮流发言且每轮携带历史', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: '多方', participants: ['codex', 'workbuddy', 'deepseekHarness'], rounds: 2,
    });

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: '多方',
      participants: ['codex', 'workbuddy', 'deepseekHarness'],
      rounds: 2,
      adapters: {
        codex: adapter('codex'),
        workbuddy: adapter('workbuddy'),
        deepseekHarness: adapter('deepseekHarness'),
      },
      cwd: 'E:/x',
      repo,
      llm,
      memoryHub: workspaceMemoryHub,
    });

    // 2 轮 × 3 人 = 6 次调用，顺序 codex→workbuddy→deepseekHarness 循环
    expect(calls).toHaveLength(6);
    expect(calls.map((c) => c.id)).toEqual([
      'codex', 'workbuddy', 'deepseekHarness',
      'codex', 'workbuddy', 'deepseekHarness',
    ]);
    // 第二轮 codex 的 prompt 应携带第一轮全部三方发言
    expect(calls[3].task).toContain('deepseekHarness 的回应 #1');
    expect(repo.messages(seminar.id)).toHaveLength(6);
    expect(repo.get(seminar.id)?.status).toBe('done');
  });

  it('提炼输出含裁决段并写入共享记忆', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: '分歧主题', participants: ['codex', 'workbuddy'], rounds: 1,
    });
    const arbLlm: Pick<LlmService, 'summarizeText'> = {
      summarizeText: async () => '结论：A\n新知识：B\n分歧：C\n行动项：D\n裁决：倾向 A',
    };

    const result = await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: '分歧主题',
      participants: ['codex', 'workbuddy'],
      rounds: 1,
      adapters: { codex: adapter('codex'), workbuddy: adapter('workbuddy') },
      cwd: 'E:/x',
      repo,
      llm: arbLlm,
      memoryHub: workspaceMemoryHub,
    });

    expect(result.status).toBe('done');
    expect(repo.get(seminar.id)?.summary).toContain('裁决');
    const memories = workspaceMemoryHub.search('裁决', 10, ws.id);
    expect(memories.length).toBeGreaterThan(0);
  });

  it('短历史不触发滚动摘要，第二轮仍含完整历史', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: '短', participants: ['codex', 'workbuddy'], rounds: 2,
    });

    await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: '短',
      participants: ['codex', 'workbuddy'],
      rounds: 2,
      adapters: { codex: adapter('codex'), workbuddy: adapter('workbuddy') },
      cwd: 'E:/x',
      repo,
      llm,
      memoryHub: workspaceMemoryHub,
      summaryThreshold: 3000,
    });

    // 第二轮 codex 的 prompt：无摘要段，含第一轮双方原文
    const codexCalls = calls.filter((c) => c.id === 'codex');
    expect(codexCalls).toHaveLength(2);
    const round2 = codexCalls[1];
    expect(round2.task).not.toContain('早期对话摘要');
    expect(round2.task).toContain('codex 的回应 #1');
    expect(round2.task).toContain('workbuddy 的回应 #1');
  });

  it('长历史触发滚动摘要：任务文本=早期摘要+最近一轮原文，且落库全量', async () => {
    const repo = new SeminarRepository();
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const seminar = repo.create({
      workspaceId: ws.id, topic: '长', participants: ['codex', 'workbuddy'], rounds: 3,
    });
    const longReply = (id: string) => `${id} 的长发言：${'观点与依据'.repeat(120)}`;
    const longAdapters = {
      codex: { run: async (task: string) => { calls.push({ id: 'codex', task }); return longReply('codex'); } } as AgentChatAdapter,
      workbuddy: { run: async (task: string) => { calls.push({ id: 'workbuddy', task }); return longReply('workbuddy'); } } as AgentChatAdapter,
    };
    const summarizeCalls: Array<{ opts?: { thinkingDisabled?: boolean; maxTokens?: number } }> = [];
    const ctxLlm: Pick<LlmService, 'summarizeText'> = {
      summarizeText: async (_msgs, opts) => {
        summarizeCalls.push({ opts });
        return '早期摘要：双方就边界达成初步一致，分歧在同步方式。';
      },
    };

    await runSeminar({
      seminarId: seminar.id,
      workspaceId: ws.id,
      topic: '长',
      participants: ['codex', 'workbuddy'],
      rounds: 3,
      adapters: longAdapters,
      cwd: 'E:/x',
      repo,
      llm: ctxLlm,
      memoryHub: workspaceMemoryHub,
      summaryThreshold: 500,
    });

    // 摘要被调用（长历史触发），且关闭思考、限制输出
    expect(summarizeCalls.some((c) => c.opts?.thinkingDisabled === true && c.opts?.maxTokens === 300)).toBe(true);

    // 第三轮 codex 的任务文本含早期摘要（第二轮结束生成）+ 最近一轮（第二轮）原文
    const codexCalls = calls.filter((c) => c.id === 'codex');
    expect(codexCalls).toHaveLength(3);
    expect(codexCalls[2].task).toContain('早期对话摘要');
    expect(codexCalls[2].task).toContain('workbuddy 的长发言');

    // 落库全量：4 条消息都在
    expect(repo.messages(seminar.id)).toHaveLength(6);
    expect(repo.get(seminar.id)?.status).toBe('done');
  });
});

describe('injectLearnings', () => {
  beforeEach(() => {
    closeDb();
    setDbPathForTests(':memory:');
    initSchema();
    const ws = workspaceRepo.create({ name: '测试工作区' });
    // 已确认的研讨会学习（会被注入）
    workspaceMemoryHub.add({
      workspaceId: ws.id,
      sourceAgent: 'seminar:codex-workbuddy',
      content: '结论：画布即状态层\n行动项：引入 jarvis-hub',
      status: 'confirmed',
    });
    // 候选的研讨会学习（未审核，不得注入）
    workspaceMemoryHub.add({
      workspaceId: ws.id,
      sourceAgent: 'seminar:codex-workbuddy',
      content: '候选结论：待审核的学习',
    });
    // 非研讨会来源（不该注入）
    workspaceMemoryHub.add({
      workspaceId: ws.id,
      sourceAgent: 'codex',
      content: '日常记录',
      status: 'confirmed',
    });
  });

  it('只注入已确认的研讨会学习（按工作区隔离、最多 3 条）', () => {
    const ws = workspaceRepo.list().find((w) => w.id !== 'default')!;
    const injected = injectLearnings(ws.id, 'codex');
    expect(injected).toContain('画布即状态层');
    expect(injected).not.toContain('候选结论：待审核的学习');
    expect(injected).not.toContain('日常记录');
  });

  it('其他工作区不注入', () => {
    expect(injectLearnings('ws-other', 'codex')).toBe('');
  });
});
