import { config } from '../config.js';
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

export const DEFAULT_MODEL_ID = 'ollama-qwen3-vl-4b';

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: DEFAULT_MODEL_ID,
    label: 'Qwen3-VL 4B（本地）',
    provider: 'Ollama（本地）',
    baseUrl: 'http://127.0.0.1:11434/v1',
    modelName: 'qwen3-vl:4b-instruct',
    apiKeyEnv: '',
    supportsStreaming: true,
    isFree: true,
    description: '复用本机视觉模型，无需 API Key，音频与对话数据不出本机',
    requiresKey: false,
  },
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-v4-flash',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    supportsStreaming: true,
    isFree: false,
    description: '快速轻量（约 67B）',
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
    id: 'deepseek-v4-flash-vision-exp',
    label: 'DeepSeek V4 Flash Vision Exp',
    provider: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-v4-flash-vision-exp',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    supportsStreaming: true,
    isFree: false,
    description: '实验性多模态视觉模型（视觉理解，图片按 384 token/张计费）',
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
];

// ===== 运行时状态 =====

let _currentModelId: string;
let _models: ModelConfig[];

// 初始化：读取当前选中模型（额外 .env 已由 config.ts 统一按 EXTRA_ENV_PATH 加载）
export function initModelRegistry(): void {
  _models = [...DEFAULT_MODELS];
  // 4.2 自定义 Provider：并入自定义模型（存在时前置）
  loadCustomModelsIntoRegistry();
  _currentModelId = process.env.ACTIVE_MODEL || DEFAULT_MODEL_ID;
  // 验证当前模型存在
  if (!_models.find((m) => m.id === _currentModelId)) {
    _currentModelId = DEFAULT_MODEL_ID;
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
  // 自定义模型（4.2）：key 存在 custom 存储，非 env
  if (model.id.startsWith('custom:')) {
    return getCustomKey(model.id);
  }
  return process.env[model.apiKeyEnv] || null;
}

// ===== 自定义模型（4.2 多 Provider 配置） =====

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CUSTOM_MODELS_FILE = process.env.CUSTOM_MODELS_FILE
  ? resolve(process.env.CUSTOM_MODELS_FILE)
  : join(config.dbPath, 'custom-models.json');

interface CustomModelRecord {
  id: string;
  label: string;
  baseUrl: string;
  modelName: string;
  apiKey: string;
}

function loadCustomModels(): CustomModelRecord[] {
  try {
    if (!existsSync(CUSTOM_MODELS_FILE)) return [];
    return JSON.parse(readFileSync(CUSTOM_MODELS_FILE, 'utf-8')) as CustomModelRecord[];
  } catch {
    return [];
  }
}

function saveCustomModels(list: CustomModelRecord[]): void {
  mkdirSync(dirname(CUSTOM_MODELS_FILE), { recursive: true });
  writeFileSync(CUSTOM_MODELS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

function getCustomKey(modelId: string): string | null {
  return loadCustomModels().find((m) => m.id === modelId)?.apiKey ?? null;
}

/** 加载自定义模型并入 _models（init 时调用） */
export function loadCustomModelsIntoRegistry(): void {
  const customs = loadCustomModels().map((c): ModelConfig => ({
    id: c.id,
    label: c.label,
    provider: '自定义',
    baseUrl: c.baseUrl,
    modelName: c.modelName,
    apiKeyEnv: '', // 自定义模型 key 存文件，不走 env
    supportsStreaming: true,
    isFree: false,
    description: '自定义 Provider（设置面板添加）',
  }));
  if (customs.length > 0) {
    _models = [...customs, ...DEFAULT_MODELS];
  }
}

/** 添加自定义模型（返回新模型 id） */
export function addCustomModel(data: {
  label: string; baseUrl: string; modelName: string; apiKey: string;
}): { success: boolean; id?: string; error?: string } {
  const label = String(data.label || '').trim();
  const baseUrl = String(data.baseUrl || '').trim().replace(/\/+$/, '');
  const modelName = String(data.modelName || '').trim();
  const apiKey = String(data.apiKey || '').trim();

  if (!label || !baseUrl || !modelName || !apiKey) {
    return { success: false, error: 'label/baseUrl/modelName/apiKey 均为必填' };
  }
  if (apiKey.length < 10) {
    return { success: false, error: 'API Key 长度过短（疑似无效）' };
  }

  const id = `custom:${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`;
  const list = loadCustomModels();
  list.push({ id, label, baseUrl, modelName, apiKey });
  saveCustomModels(list);
  loadCustomModelsIntoRegistry();
  return { success: true, id };
}

/** 删除自定义模型 */
export function removeCustomModel(id: string): { success: boolean; error?: string } {
  const list = loadCustomModels();
  const next = list.filter((m) => m.id !== id);
  if (next.length === list.length) return { success: false, error: '未找到自定义模型' };
  saveCustomModels(next);
  loadCustomModelsIntoRegistry();
  return { success: true };
}
