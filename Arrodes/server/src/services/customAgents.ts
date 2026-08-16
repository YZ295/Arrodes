export interface CustomAgentConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  probeArgs?: string[];
  capabilities?: string[];
}

export function customAgentsFile(): string {
  return process.env.ARRODES_AGENTS_FILE || resolve(process.cwd(), 'data', 'custom-agents.json');
}

export function loadCustomAgents(filePath: string): CustomAgentConfig[] {
  if (!existsSync(filePath)) return [];
  try {
    const json = JSON.parse(readFileSync(filePath, 'utf-8')) as { agents?: unknown };
    if (!Array.isArray(json.agents)) return [];
    return json.agents.filter((a): a is CustomAgentConfig =>
      Boolean(a) && typeof (a as CustomAgentConfig).id === 'string' && typeof (a as CustomAgentConfig).command === 'string',
    );
  } catch {
    return [];
  }
}
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
