/**
 * STT 模式持久化（D2=C：一键切换 online/local/auto，重启保留）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSttMode, type SttMode } from './sttService.js';

const DEFAULT_MODE: SttMode = 'online';
let settingsDir: string | null = null;

export function setSttSettingsDirForTest(dir: string | null): void {
  settingsDir = dir;
}

function settingsFile(): string {
  const base = settingsDir
    ?? (process.env.DB_PATH || resolve(dirname(fileURLToPath(import.meta.url)), '../../data'));
  return resolve(base, 'stt-mode.json');
}

export function getSttMode(): SttMode {
  try {
    const file = settingsFile();
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf-8')) as { mode?: unknown };
      if (isSttMode(data.mode)) return data.mode;
    }
  } catch {
    // 损坏配置回退默认
  }
  return DEFAULT_MODE;
}

export function setSttMode(mode: SttMode): SttMode {
  const file = settingsFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ mode, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  return mode;
}
