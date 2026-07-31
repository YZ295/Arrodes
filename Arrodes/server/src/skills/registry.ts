/**
 * 智能体技能系统 (Agent Skills)
 *
 * 定义 Agent 可以执行的工具/技能。
 * LLM 在对话中决定是否需要调用技能，调用结果再注入回对话。
 *
 * 技能调用协议（注入 LLM 系统提示词）：
 *   当需要执行操作时，输出：<tool_call>{ "name": "skill_name", "args": {...} }</tool_call>
 *   执行结果会自动注入为：系统通知: 技能执行结果: ...
 */

// ===== 技能接口 =====

export interface SkillArg {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  description: string;
}

export interface AgentSkill {
  /** 技能唯一标识 */
  name: string;
  /** 技能描述（LLM 用于判断何时使用） */
  description: string;
  /** 参数定义 */
  args: SkillArg[];
  /** 执行技能 */
  execute: (args: Record<string, unknown>) => Promise<string>;
}

// ===== 技能注册表 =====

const skills = new Map<string, AgentSkill>();

export function registerSkill(skill: AgentSkill): void {
  skills.set(skill.name, skill);
}

export function unregisterSkill(name: string): boolean {
  return skills.delete(name);
}

export function getSkill(name: string): AgentSkill | undefined {
  return skills.get(name);
}

export function getAllSkills(): AgentSkill[] {
  return Array.from(skills.values());
}

/**
 * 构建技能提示词（注入 LLM 系统提示）
 */
export function buildSkillsPrompt(): string {
  if (skills.size === 0) return '';

  const skillList = Array.from(skills.values())
    .map((s) => {
      const args = s.args.map((a) => `"${a.name}"(${a.type}, ${a.required ? '必填' : '可选'}): ${a.description}`).join(', ');
      return `- **${s.name}**: ${s.description}。参数: ${args}`;
    })
    .join('\n');

  return [
    '',
    '## 可用工具',
    '你可以调用以下工具来获取信息或执行操作：',
    skillList,
    '',
    '引用工具格式（严格遵守）：',
    '<tool_call>{"name": "技能名", "args": {"参数名": "值"}}</tool_call>',
    '调用后将收到：系统通知: 技能执行结果，然后你可以基于结果继续回复。',
  ].join('\n');
}

/**
 * 尝试从 LLM 回复中解析技能调用
 */
export function parseToolCall(text: string): { name: string; args: Record<string, unknown> } | null {
  const match = text.match(/<tool_call>(.*?)<\/tool_call>/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * 执行技能并返回格式化结果
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const skill = skills.get(name);
  if (!skill) return `错误: 未找到技能 "${name}"`;

  try {
    const result = await skill.execute(args);
    return result;
  } catch (err) {
    return `错误: ${err instanceof Error ? err.message : '执行失败'}`;
  }
}
