import { describe, it, expect, afterEach } from 'vitest';
import { getAllSkills, executeToolCall } from './registry.js';
import './agentProtocols.js';

const savedHome = process.env.CODEX_HOME;

afterEach(() => {
  if (savedHome === undefined) {
    delete process.env.CODEX_HOME;
  } else {
    process.env.CODEX_HOME = savedHome;
  }
});

describe('agentProtocols（REQ-009 metagpt/openbot 技能登记）', () => {
  it('GET /skills 数据源包含 metagpt 与 openbot', () => {
    const names = getAllSkills().map((s) => s.name);
    expect(names).toContain('metagpt');
    expect(names).toContain('openbot');
  });

  it('execute 返回已安装 SKILL.md 正文', async () => {
    process.env.CODEX_HOME = 'E:/AI/Codex';
    const metagpt = await executeToolCall('metagpt', {});
    expect(metagpt).toContain('MetaGPT');
    const openbot = await executeToolCall('openbot', {});
    expect(openbot).toContain('审计');
  });

  it('SKILL.md 缺失时返回内置降级协议且不抛错', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), 'codex-empty-'));

    const metagpt = await executeToolCall('metagpt', {});
    const openbot = await executeToolCall('openbot', {});

    expect(metagpt).toContain('多角色');
    expect(openbot).toContain('可审计');
    expect(metagpt).not.toContain('Error');
    expect(openbot).not.toContain('Error');
  });
});
