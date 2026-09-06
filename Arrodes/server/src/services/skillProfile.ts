/**
 * 技能 Profile（借鉴 DeepSeek Harness：按配置组合插件树，轻量版）
 *
 * 从 SKILL_PROFILE_FILE 指向的 JSON 读取禁用的技能名，启动时应用到注册表。
 * 例：{ "disabled": ["minimax_tts", "exec_command"] }
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setSkillEnabled } from '../skills/registry.js';

export function applySkillProfile(): void {
  const profilePath = process.env.SKILL_PROFILE_FILE || resolve(process.cwd(), 'data', 'skill-profiles.json');
  let disabled: string[] = [];

  try {
    if (existsSync(profilePath)) {
      const json = JSON.parse(readFileSync(profilePath, 'utf-8')) as { disabled?: unknown };
      if (Array.isArray(json.disabled)) {
        disabled = json.disabled.filter((x): x is string => typeof x === 'string');
      }
    }
  } catch {
    // 配置缺失或损坏时保持全量启用
  }

  for (const name of disabled) {
    setSkillEnabled(name, false);
  }
  if (disabled.length > 0) {
    console.log(`[SkillProfile] 已禁用技能: ${disabled.join(', ')}`);
  }
}
