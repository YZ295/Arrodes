/**
 * 外部智能体协议技能族（metagpt / openbot）
 *
 * 这两个技能与 $CODEX_HOME/skills 下已安装的 SKILL.md 对应：
 * - metagpt：MetaGPT 多角色软件开发方法论（PM→架构→工程→QA，结构化交接）
 * - openbot：OpenBot 可审计自主操作模型（先决策→再执行→后记录，deny-first）
 *
 * 作用：
 * 1. 在输入栏 ＋技能菜单可见，可附加到发给 codex 智能体的消息（codex 已装
 *    同名 SKILL.md，看到技能名即可遵循）；
 * 2. 主 agent 调用时，execute 返回 SKILL.md 正文供其遵循；文件缺失时返回
 *    内置精简协议，不抛错。
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { registerSkill } from './registry.js';

function skillDocPath(name: string): string {
  const home = process.env.CODEX_HOME || join(homedir(), '.codex');
  return resolve(home, 'skills', name, 'SKILL.md');
}

/** 读取 SKILL.md 正文（去掉 YAML frontmatter）；失败返回 null */
function readSkillDoc(name: string): string | null {
  try {
    const text = readFileSync(skillDocPath(name), 'utf-8');
    const body = text.replace(/^---[\s\S]*?---\s*/, '').trim();
    return body || null;
  } catch {
    return null;
  }
}

const METAGPT_FALLBACK = `【metagpt · MetaGPT 多角色软件开发】
按 MetaGPT 方法论工作：按任务规模选择角色架构（<3 步单 agent + 结构化模板；
3-7 步用 PM→架构→工程→QA 角色分工并产出结构化交接物；>7 步用 pub-sub 消息池）。
每个角色只负责一类结构化产出物；交接物必须有可验证字段；可执行产出必须跑
执行反馈闭环；任何「验证完成」都要有具体证据，不接受自评。质量门槛逐项勾选，
发现幻觉级联/上下文稀释/协调抖动时按文档修复。`;

const OPENBOT_FALLBACK = `【openbot · OpenBot 可审计自主操作】
以 OpenBot 方式工作：先决策（动作类型/目标/预期效果/边界）→ 再执行（只在授权
范围内，越界拒绝）→ 后记录（追加到工作区 .openbot/audit/ 审计日志）。
deny-first：未授予即拒绝；登录墙/2FA/权限不明时停止请求人工接管。汇报时给出
做了什么、留下哪些文件、审计日志位置、未完成/被拒绝项；不贴密钥与日志全文。`;

registerSkill({
  name: 'metagpt',
  description:
    '按 MetaGPT 多角色软件开发方法论工作：拆角色（PM→架构→工程→QA）、结构化产出物交接、执行反馈闭环、质量门槛逐项验证。用户要求软件开发/多角色分工/复杂任务拆解，或要附加给 codex 智能体按此流程开发时调用。',
  args: [],
  risk: 'low',
  readOnly: true,
  execute: async () => readSkillDoc('metagpt') ?? METAGPT_FALLBACK,
});

registerSkill({
  name: 'openbot',
  description:
    '以 OpenBot（CopilotKit 开源 AI 同事框架）方式工作：先决策→再执行→后记录，deny-first 授权边界，动作留痕审计日志。用户要求安全自主操作电脑/浏览器/文件并留下审计轨迹，或要附加给 codex 智能体按此模式执行时调用。',
  args: [],
  risk: 'low',
  readOnly: true,
  execute: async () => readSkillDoc('openbot') ?? OPENBOT_FALLBACK,
});
