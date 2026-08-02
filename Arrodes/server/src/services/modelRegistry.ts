/**
 * 模型注册表
 * 统一管理所有可用的 AI 模型及其供应商配置
 */
import { existsSync, readFileSync } from 'node:fs';

// ===== 模型定义 =====

export interface ModelConfig {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  label: string;
  /** 供应商 */
  provider: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 实际请求用的模型名 */
  modelName: string;
  /** 环境变量中的 API Key 名 */
  apiKeyEnv: string;
  /** 是否支持流式 */
  supportsStreaming: boolean;
  /** 是否免费 */
  isFree: boolean;
  /** 中文描述 */
  description: string;
  /** 是否需要 API Key（本地模型如 Ollama 不需要） */
  requiresKey?: boolean;
}

// ===== 默认模型列表 =====

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-v4-flash',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    supportsStreaming: true,
    isFree: false,
    description: '快速轻量（约 67B），默认模型',
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-v4-pro',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    supportsStreaming: true,
    isFree: false,
    description: '更强推理能力',
  },
  {
    id: 'kimi-k2.6',
    label: 'Kimi K2.6',
    provider: '月之暗面 (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'kimi-k2.6',
    apiKeyEnv: 'KIMI_API_KEY',
    supportsStreaming: true,
    isFree: false,
    description: '长上下文支持',
  },
  {
    id: 'kimi-k2.7-code',
    label: 'Kimi K2.7 Code',
    provider: '月之暗面 (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelName: 'kimi-k2.7-code',
    apiKeyEnv: 'KIMI_API_KEY',
    supportsStreaming: true,
    isFree: false,
    description: '编程增强',
  },
  {
    id: 'glm-4-flash',
    label: 'GLM-4 Flash',
    provider: '智谱 AI (Zhipu)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelName: 'glm-4-flash',
    apiKeyEnv: 'GLM_API_KEY',
    supportsStreaming: true,
    isFree: true,
    description: '智谱轻量模型，当前可用',
  },
  {
    id: 'ollama-gemma3',
    label: '本地模型 (Ollama gemma3:1b)',
    provider: '本地 (Ollama)',
    baseUrl: 'http://localhost:11434/v1',
    modelName: 'gemma3:1b',
    apiKeyEnv: 'OLLAMA_API_KEY',
    supportsStreaming: true,
    isFree: true,
    requiresKey: false,
    description: '本地运行，零成本（质量一般，建议后续换 qwen2.5:7b）',
  },
];

// ===== 运行时状态 =====

let _currentModelId: string;
let _models: ModelConfig[];

function loadHermesEnv(): void {
  // 共享 .env 路径可配置：HERMES_ENV_PATH（或兼容 EXTRA_ENV_PATH）。
  // 不设置时跳过，绝不硬编码机器路径。
  const sharedEnvPath = process.env.HERMES_ENV_PATH || process.env.EXTRA_ENV_PATH;
  if (!sharedEnvPath) return;
  if (existsSync(sharedEnvPath)) {
    const content = readFileSync(sharedEnvPath, 'utf-8');
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
}

// 初始化：从 Hermes 加载 API Keys，再读当前选中模型
export function initModelRegistry(): void {
  loadHermesEnv();
  _models = [...DEFAULT_MODELS];
  _currentModelId = process.env.ACTIVE_MODEL || 'ollama-gemma3';
  // 验证当前模型存在
  if (!_models.find((m) => m.id === _currentModelId)) {
    _currentModelId = 'ollama-gemma3';
  }
}

export function getModels(): ModelConfig[] {
  return _models;
}

export function getCurrentModel(): ModelConfig {
  const model = _models.find((m) => m.id === _currentModelId);
  if (!model) return _models[0];
  return model;
}

export function getCurrentModelId(): string {
  return _currentModelId;
}

export function setCurrentModel(modelId: string): { success: boolean; error?: string } {
  const model = _models.find((m) => m.id === modelId);
  if (!model) {
    return { success: false, error: `未知模型: ${modelId}` };
  }

  // 验证 API Key 存在（本地模型不需要）
  if (model.requiresKey !== false) {
    const apiKey = process.env[model.apiKeyEnv];
    if (!apiKey || apiKey.length < 10) {
      return { success: false, error: `模型 ${model.label} 的 API Key 未配置（${model.apiKeyEnv}）` };
    }
  }

  _currentModelId = modelId;
  return { success: true };
}

export function getApiKeyForModel(modelId: string): string | null {
  const model = _models.find((m) => m.id === modelId);
  if (!model) return null;
  return process.env[model.apiKeyEnv] || null;
}
