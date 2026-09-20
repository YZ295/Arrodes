/**
 * 自定义模型（多 Provider）测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 隔离存储文件（模块加载前设置 env）
let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'custom-models-test-'));
  process.env.CUSTOM_MODELS_FILE = join(tmpDir, 'custom-models.json');
  delete process.env.PROMPT_SHELL_FILE;
});

afterEach(() => {
  delete process.env.CUSTOM_MODELS_FILE;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('自定义模型 registry', () => {
  it('默认使用无需 API Key 的本地 Ollama Qwen3-VL', async () => {
    const {
      initModelRegistry,
      getCurrentModel,
      getCurrentModelId,
      getApiKeyForModel,
      setCurrentModel,
    } = await import('./modelRegistry.js');
    const previous = process.env.ACTIVE_MODEL;
    delete process.env.ACTIVE_MODEL;
    try {
      initModelRegistry();

      expect(getCurrentModelId()).toBe('ollama-qwen3-vl-4b');
      expect(getCurrentModel()).toMatchObject({
        provider: 'Ollama（本地）',
        baseUrl: 'http://127.0.0.1:11434/v1',
        modelName: 'qwen3-vl:4b-instruct',
        requiresKey: false,
      });
      expect(getApiKeyForModel('ollama-qwen3-vl-4b')).toBeNull();
      expect(setCurrentModel('ollama-qwen3-vl-4b')).toEqual({ success: true });
    } finally {
      if (previous === undefined) delete process.env.ACTIVE_MODEL;
      else process.env.ACTIVE_MODEL = previous;
    }
  });

  it('ACTIVE_MODEL 无效时安全回退到本地 Ollama', async () => {
    const previous = process.env.ACTIVE_MODEL;
    process.env.ACTIVE_MODEL = 'missing-model';
    try {
      const { initModelRegistry, getCurrentModelId } = await import('./modelRegistry.js');
      initModelRegistry();
      expect(getCurrentModelId()).toBe('ollama-qwen3-vl-4b');
    } finally {
      if (previous === undefined) delete process.env.ACTIVE_MODEL;
      else process.env.ACTIVE_MODEL = previous;
    }
  });

  it('添加自定义模型并可在列表中查到', async () => {
    const { addCustomModel, loadCustomModelsIntoRegistry, getModels } = await import('./modelRegistry.js');
    const r = addCustomModel({ label: '我的中转站', baseUrl: 'https://proxy.example.com/v1', modelName: 'gpt-4o', apiKey: 'sk-test-1234567890' });
    expect(r.success).toBe(true);
    expect(r.id).toMatch(/^custom:/);

    loadCustomModelsIntoRegistry();
    const models = getModels();
    expect(models.some((m) => m.id === r.id && m.provider === '自定义')).toBe(true);
  });

  it('key 缺失/过短时拒绝', async () => {
    const { addCustomModel } = await import('./modelRegistry.js');
    expect(addCustomModel({ label: 'X', baseUrl: 'https://x', modelName: 'm', apiKey: '' }).success).toBe(false);
    expect(addCustomModel({ label: 'X', baseUrl: 'https://x', modelName: 'm', apiKey: 'short' }).success).toBe(false);
  });

  it('自定义模型 key 可从存储读取', async () => {
    const { addCustomModel, getApiKeyForModel, loadCustomModelsIntoRegistry } = await import('./modelRegistry.js');
    const r = addCustomModel({ label: 'K', baseUrl: 'https://k/v1', modelName: 'm', apiKey: 'sk-abcdefghijkl' });
    loadCustomModelsIntoRegistry();
    expect(getApiKeyForModel(r.id!)).toBe('sk-abcdefghijkl');
  });

  it('删除自定义模型', async () => {
    const { addCustomModel, removeCustomModel, loadCustomModelsIntoRegistry, getModels } = await import('./modelRegistry.js');
    const r = addCustomModel({ label: 'D', baseUrl: 'https://d/v1', modelName: 'm', apiKey: 'sk-abcdefghijkl' });
    loadCustomModelsIntoRegistry();
    expect(getModels().some((m) => m.id === r.id)).toBe(true);
    expect(removeCustomModel(r.id!).success).toBe(true);
    loadCustomModelsIntoRegistry();
    expect(getModels().some((m) => m.id === r.id)).toBe(false);
  });
});
