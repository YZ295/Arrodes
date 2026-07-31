import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// 1. 先加载用户级安全密钥（$HOME/.arrodes/.env）—— 真实 API Key 不放在 repo 内
import { homedir } from 'node:os';
const userEnvPath = resolve(homedir(), '.arrodes/.env');
if (existsSync(userEnvPath)) {
  dotenv.config({ path: userEnvPath });
}

// 2. 再加载 repo 内 .env（仅含占位符/默认值，可被上一步覆盖）
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// 从指定路径加载额外 .env（可配置，例如 Hermes 的共享 .env）
const extraEnvPath = process.env.EXTRA_ENV_PATH;
if (extraEnvPath && existsSync(extraEnvPath)) {
  const content = readFileSync(extraEnvPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data',

  // DeepSeek 配置
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
};
