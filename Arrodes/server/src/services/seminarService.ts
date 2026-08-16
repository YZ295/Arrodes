/**
 * 研讨会编排服务（多 Agent 互相对话学习）
 *
 * 借鉴 AutoGen 双 agent 交替对话 + agent-learn 的学习回路（Trace→Analyze→Inject）：
 * - 两个已接入 agent 围绕主题轮流发言（历史拼入任务文本，适配外部 CLI agent 无多轮会话）
 * - 结束后由阿罗德斯（LlmService）提炼结构化学习小结（结论/新知识/分歧/行动项）
 * - 小结写入工作区全量共享记忆（sourceAgent: seminar:a-b），后续对话自动注入
 *
 * 每个 agent 发言前注入过往研讨会学习（最多 3 条），形成「互相学习」闭环。
 */
import type { AgentChatAdapter } from './agentAdapters.js';
import type { LlmService } from './llmService.js';
import type { SeminarRepository } from '../db/seminar-repo.js';
import type { WorkspaceMemory, WorkspaceMemoryHub } from '../workspace/memory-hub.js';
import { workspaceMemoryHub } from '../workspace/memory-hub.js';

export interface SeminarTurn {
  speaker: string;
  content: string;
}

export interface BuildSeminarPromptInput {
  topic: string;
  self: string;
  other: string;
  transcript: SeminarTurn[];
  learnings: string;
}

/** 给单个 agent 的发言任务：主题 + 身份 + 完整已发生对话 + 过往学习 */
export function buildSeminarPrompt(input: BuildSeminarPromptInput): string {
  const history = input.transcript.length
    ? input.transcript.map((t) => `${t.speaker}：${t.content}`).join('\n')
    : '（还没有发言）';
  return [
    `你在参加一场多智能体研讨会，主题是：${input.topic}`,
    `你是「${input.self}」，与「${input.other}」围绕主题轮流交换观点。`,
    '要求：观点直接、有依据；可以同意也可以反驳对方；不要客套，不要重复已说内容。',
    input.learnings ? `\n【你们此前研讨会的沉淀】\n${input.learnings}` : '',
    `\n【截至目前的对话】\n${history}`,
    '\n现在轮到你发言，请直接输出你的观点（不要加称呼/前缀）。',
  ].filter(Boolean).join('\n');
}

export interface RunSeminarInput {
  seminarId: string;
  workspaceId: string;
  topic: string;
  agentA: string;
  agentB: string;
  rounds: number;
  adapters: Record<string, AgentChatAdapter>;
  cwd: string;
  repo: SeminarRepository;
  llm: Pick<LlmService, 'summarizeText'>;
  memoryHub: Pick<WorkspaceMemoryHub, 'searchBySource' | 'search' | 'add'>;
}

/** 按来源 agent 前缀过滤研讨会沉淀（sourceAgent: seminar:xxx） */
function seminarLearnings(memories: Array<Pick<WorkspaceMemory, 'sourceAgent' | 'content'>>): string[] {
  return memories
    .filter((m) => m.sourceAgent.startsWith('seminar:'))
    .map((m) => m.content.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/** 检索本工作区研讨会学习（供研讨会与后续对话注入） */
export function injectLearnings(
  workspaceId: string,
  agentId: string,
  hub: Pick<WorkspaceMemoryHub, 'searchBySource' | 'search' | 'add'> = workspaceMemoryHub,
): string {
  // 优先按来源前缀（seminar:）检索，且包含该 agent 的研讨会学习
  const byAgent = seminarLearnings(
    hub.searchBySource('seminar:', workspaceId || 'default', 10)
      .filter((m) => m.sourceAgent.includes(agentId)),
  );
  if (byAgent.length === 0) {
    // 兜底：任意研讨会学习（agent 尚未参与过研讨会时也可吸收他人经验）
    return seminarLearnings(hub.searchBySource('seminar:', workspaceId || 'default', 10)).join('\n');
  }
  return byAgent.join('\n');
}

/** 把 LLM 提炼结果解析为四段学习结构 */
export function parseLearnings(summary: string): {
  conclusion: string;
  newKnowledge: string;
  disagreement: string;
  actionItems: string;
} {
  const pick = (label: string): string => {
    // 兼容：结论： / ## 结论 / **结论**：
    const re = new RegExp(`(?:##\\s*)?(?:\\*\\*)?${label}(?:\\*\\*)?[：:]\\s*([^\\n]*(?:\\n(?!##|\\*\\*(?:结论|新知识|分歧|行动项)\\*\\*[：:]|(?:结论|新知识|分歧|行动项)[：:]).*)*)`, 'i');
    const m = summary.match(re);
    return m ? m[1].trim().slice(0, 400) : '';
  };
  return {
    conclusion: pick('结论'),
    newKnowledge: pick('新知识'),
    disagreement: pick('分歧'),
    actionItems: pick('行动项'),
  };
}

/** 研讨会结束后阿罗德斯提炼学习并写入全量共享记忆 */
export async function summarizeSeminar(input: {
  topic: string;
  agentA: string;
  agentB: string;
  transcript: SeminarTurn[];
  workspaceId: string;
  llm: Pick<LlmService, 'summarizeText'>;
  memoryHub: Pick<WorkspaceMemoryHub, 'searchBySource' | 'search' | 'add'>;
  repo: SeminarRepository;
  seminarId: string;
}): Promise<string> {
  const transcriptText = input.transcript
    .map((t) => `${t.speaker}：${t.content}`)
    .join('\n')
    .slice(0, 6000);
  // DeepSeek 推理模型会把大量 token 花在 reasoning_content：
  // max_tokens 不足时 content 为空。给足预算 + 最多 3 次换措辞重试。
  let summary = '';
  const promptVariants = [
    '以下是两个 AI 智能体围绕同一主题的研讨会记录。请提炼成可复用的学习小结，按固定四段输出：',
    '请阅读以下研讨会对话，归纳出学习要点，按以下四段格式输出：',
    '根据以下多智能体研讨记录，整理一份学习笔记，输出四段：',
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    summary = await input.llm.summarizeText([
      {
        role: 'user',
        content: [
          promptVariants[attempt],
          '结论：双方达成一致的最终结论',
          '新知识：研讨会中出现的新知识/新方法',
          '分歧：双方未达成一致的分歧点',
          '行动项：后续应该执行的动作',
          '每段一句话以内，总共不超过 350 字。',
          '',
          `主题：${input.topic}`,
          `参与：${input.agentA} ↔ ${input.agentB}`,
          '',
          transcriptText,
        ].join('\n'),
      },
    ], {
      systemPrompt: attempt === 0
        ? '你是阿罗德斯的知识提炼中枢，只输出结构化四段，不输出其他内容。'
        : '你是会议记录员，负责把讨论提炼成四段式摘要。',
      maxTokens: 2048,
      temperature: attempt === 0 ? 0.3 : 0.6,
      thinkingDisabled: true,
    });
    if (summary.trim().length >= 20) break;
  }

  const parsed = parseLearnings(summary);
  const learning = [
    `主题：${input.topic}`,
    parsed.conclusion ? `结论：${parsed.conclusion}` : '',
    parsed.newKnowledge ? `新知识：${parsed.newKnowledge}` : '',
    parsed.disagreement ? `分歧：${parsed.disagreement}` : '',
    parsed.actionItems ? `行动项：${parsed.actionItems}` : '',
  ].filter(Boolean).join('\n').slice(0, 2000);

  try {
    input.memoryHub.add({
      workspaceId: input.workspaceId,
      sourceAgent: `seminar:${input.agentA}-${input.agentB}`,
      type: 'note',
      content: learning || `研讨会（${input.topic}）结束，无结构化提炼结果。`,
    });
  } catch (err) {
    console.warn('[Seminar] 学习小结写入共享记忆失败:', err instanceof Error ? err.message : err);
  }

  const full = [
    `主题：${input.topic}`,
    `参与：${input.agentA} ↔ ${input.agentB}`,
    '',
    summary.trim(),
  ].join('\n');
  input.repo.finish(input.seminarId, { status: 'done', summary: full });
  return full;
}

/**
 * 执行研讨会：A/B 轮流发言 rounds 轮 → 提炼学习 → 落库 + 共享记忆
 * 单方失败时标记 failed，保留已发生的发言；后续由路由层兜底返回。
 */
export async function runSeminar(input: RunSeminarInput): Promise<{ status: 'done' | 'failed'; seminarId: string }> {
  const { repo } = input;
  const adapters = input.adapters;
  const transcript: SeminarTurn[] = [];
  const speakers = [input.agentA, input.agentB];

  try {
    const prior = injectLearnings(input.workspaceId, input.agentA, input.memoryHub);
    for (let round = 0; round < input.rounds; round++) {
      for (const self of speakers) {
        const other = self === input.agentA ? input.agentB : input.agentA;
        const adapter = adapters[self];
        if (!adapter) throw new Error(`智能体 ${self} 没有可用对话适配器`);
        const task = buildSeminarPrompt({
          topic: input.topic,
          self,
          other,
          transcript,
          learnings: prior,
        });
        const reply = await adapter.run(task, { cwd: input.cwd });
        const content = (reply || '').trim() || `${self} 无输出`;
        transcript.push({ speaker: self, content });
        repo.appendMessage(input.seminarId, self, content);
      }
    }

    try {
      await summarizeSeminar({
        topic: input.topic,
        agentA: input.agentA,
        agentB: input.agentB,
        transcript,
        workspaceId: input.workspaceId,
        llm: input.llm,
        memoryHub: input.memoryHub,
        repo: input.repo,
        seminarId: input.seminarId,
      });
    } catch (err) {
      // 提炼失败不判死研讨会：保留对话，写降级记录并标记 done（附说明）
      const msg = err instanceof Error ? err.message : String(err);
      const fallback = `研讨会（${input.topic}）已完成，但学习提炼失败（${msg.slice(0, 200)}）。\n\n原始对话摘录：\n${transcript
        .slice(0, 2)
        .map((t) => `${t.speaker}：${t.content.slice(0, 200)}`)
        .join('\n')}`.slice(0, 2000);
      try {
        input.memoryHub.add({
          workspaceId: input.workspaceId,
          sourceAgent: `seminar:${input.agentA}-${input.agentB}`,
          type: 'note',
          content: fallback,
        });
      } catch { /* 忽略二次失败 */ }
      input.repo.finish(input.seminarId, {
        status: 'done',
        summary: `研讨会（${input.topic}）对话完成，学习提炼失败：${msg.slice(0, 300)}`,
      });
    }
    return { status: 'done', seminarId: input.seminarId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    repo.finish(input.seminarId, { status: 'failed', error: msg.slice(0, 500) });
    return { status: 'failed', seminarId: input.seminarId };
  }
}
