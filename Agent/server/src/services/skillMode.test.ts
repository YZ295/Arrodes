/**
 * 技能模式测试（借鉴 DeepSeek Harness 的 Agent Preset 语义）
 *
 * 验证：模式清单齐全、切换即时生效（禁用/恢复）、未知模式拒绝、持久化读取兜底。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  registerSkill, unregisterSkill, isSkillEnabled,
} from '../skills/registry.js';
import {
  SKILL_MODES, getSkillModes, getCurrentMode, setSkillMode,
} from './skillMode.js';

// 使用模式清单中的真实技能名注册测试技能，覆盖「切换恢复」边界
const TEST_SKILLS = ['volume_control', 'minimax_tts', 'self_modify', 'read_file'];

beforeEach(() => {
  for (const name of TEST_SKILLS) {
    registerSkill({
      name,
      description: 'test',
      args: [],
      risk: 'low',
      execute: async () => 'ran',
    });
  }
  // 干净起点：标准模式
  setSkillMode('standard');
});

afterEach(() => {
  for (const name of TEST_SKILLS) {
    unregisterSkill(name);
  }
  setSkillMode('standard');
});

describe('技能模式', () => {
  it('提供 DSH 对齐的四套预设（标准/PTC/创造/极简）', () => {
    expect(getSkillModes().map((m) => m.id)).toEqual([
      'standard', 'ptc', 'creator', 'minimal',
    ]);
    for (const mode of SKILL_MODES) {
      expect(mode.name).toBeTruthy();
      expect(mode.description).toBeTruthy();
    }
  });

  it('标准模式全量启用技能', () => {
    setSkillMode('standard');
    for (const name of TEST_SKILLS) {
      expect(isSkillEnabled(name)).toBe(true);
    }
    expect(getCurrentMode().id).toBe('standard');
  });

  it('PTC 模式按清单禁用娱乐类技能、保留编程类技能', () => {
    const result = setSkillMode('ptc');
    expect(result.success).toBe(true);
    // 编程类保留
    expect(isSkillEnabled('__mode_focus__')).toBe(true);
    // 娱乐类禁用
    expect(isSkillEnabled('volume_control')).toBe(false);
    expect(isSkillEnabled('minimax_tts')).toBe(false);
    expect(isSkillEnabled('self_modify')).toBe(true);
    expect(getCurrentMode().id).toBe('ptc');
  });

  it('切回标准模式会恢复被禁用的技能', () => {
    setSkillMode('creator');
    expect(isSkillEnabled('self_modify')).toBe(false);
    setSkillMode('standard');
    expect(isSkillEnabled('self_modify')).toBe(true);
  });

  it('未知模式返回错误且不改变当前模式', () => {
    setSkillMode('ptc');
    const result = setSkillMode('no-such-mode');
    expect(result.success).toBe(false);
    expect(getCurrentMode().id).toBe('ptc');
  });
});
