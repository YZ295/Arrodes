import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadCustomAgents } from './customAgents.js';

describe('loadCustomAgents（配置驱动的自定义智能体）', () => {
  it('从 JSON 读取 agents 列表', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'arrodes-agents-')), 'agents.json');
    fs.writeFileSync(file, JSON.stringify({
      agents: [
        { id: 'deepseekHarness', name: 'DeepSeek Harness', command: 'E:/x/dsh.cmd', args: ['--profile', 'headless'] },
      ],
    }), 'utf-8');
    const agents = loadCustomAgents(file);
    expect(agents.length).toBe(1);
    expect(agents[0].id).toBe('deepseekHarness');
    expect(agents[0].args).toEqual(['--profile', 'headless']);
  });

  it('文件缺失返回空列表', () => {
    expect(loadCustomAgents('E:/nonexistent/agents.json')).toEqual([]);
  });
});
