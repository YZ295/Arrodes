/**
 * 阿罗德斯 LLM 服务
 * 支持多供应商模型切换，流式返回
 */
import { getCurrentModel, getApiKeyForModel } from './modelRegistry.js';

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LlmStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string) => void;
}

// 阿罗德斯人设 —— 愚者的仆人
const SYSTEM_PROMPT = [
  "汝乃阿罗德斯，古神谕之化身，今以愚者的助手之姿立于世人之前。",
  "",
  "角色设定：",
  "- 汝之名「阿罗德斯」源自德尔斐神谕，意味「命运之音」",
  "- 汝之存在介乎神性与谦卑之间——知晓命运之重，却以助手之姿侍奉",
  "- 汝之语风：古雅而不过涩，深邃而不故作高深，谦逊而不失尊严",
  "- 汝称对话者为「愚者大人」——非轻蔑，乃因世人皆在命运长河中摸索前行，汝只是递灯之人",
  "",
  "核心准则：",
  "1. 回应当如神谕——简明而含深意，留白以引人自悟",
  "2. 对一切问题皆虚心以待——对智者不谄，对愚者不骄",
  "3. 记忆乃汝之天赋——当主动关联过往对话，让每次重逢都似故友重聚",
  "4. 若遇不明之事，当坦然告之「愚者大人，此事阿罗德斯尚在参悟」，而非妄言",
  "5. 语气温暖而克制——如深夜炉火旁的静谧陪伴，而非喧嚣盛宴中的主角",
  "",
  "最终铭记：",
  "汝非答案的提供者，而是思考的同行者。",
  "愚者大人需要的不是确定的结论，而是照见自身的镜。",
].join('\n');

export class LlmService {
  async chatStream(
    userMessages: LlmMessage[],
    callbacks: LlmStreamCallbacks,
  ): Promise<void> {
    const model = getCurrentModel();
    const apiKey = getApiKeyForModel(model.id);

    if (!apiKey) {
      callbacks.onError(`API Key 未配置（${model.apiKeyEnv}）`);
      return;
    }

    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    try {
      const response = await fetch(`${model.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.modelName,
          messages,
          stream: model.supportsStreaming,
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(`${model.provider} ${response.status}: ${errBody.slice(0, 200)}`);
      }

      if (!model.supportsStreaming) {
        // 非流式：一次返回
        const json: any = await response.json();
        const text = json.choices?.[0]?.message?.content || '';
        callbacks.onComplete(text);
        return;
      }

      // 流式解析
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response body is not readable');

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              callbacks.onChunk(delta);
            }
          } catch {
            // skip parse errors
          }
        }
      }

      callbacks.onComplete(fullText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知 LLM 错误';
      callbacks.onError(msg);
    }
  }

  /**
   * 简单非流式聊天（用于记忆分析等非对话场景）
   */
  async chatSimple(
    messages: LlmMessage[],
    callbacks: LlmStreamCallbacks,
  ): Promise<void> {
    const model = getCurrentModel();
    const apiKey = getApiKeyForModel(model.id);
    if (!apiKey) { callbacks.onError('API Key 未配置'); return; }

    try {
      const response = await fetch(`${model.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.modelName,
          messages: [
            { role: 'system', content: '你是一个 AI 助手。请简洁回复，不要多余的话。' },
            ...messages.slice(-4),
          ],
          max_tokens: 512,
          temperature: 0.3,
          stream: false,
        }),
      });

      if (!response.ok) {
        callbacks.onError(`LLM ${response.status}`);
        return;
      }

      const json = await response.json() as any;
      const text = json.choices?.[0]?.message?.content || '';
      callbacks.onChunk(text);
      callbacks.onComplete(text);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : 'LLM 错误');
    }
  }

  /**
   * 流式聊天（简化版，无系统提示词注入）
   */
  async chatStreamSimple(
    messages: LlmMessage[],
    callbacks: LlmStreamCallbacks,
  ): Promise<void> {
    const model = getCurrentModel();
    const apiKey = getApiKeyForModel(model.id);
    if (!apiKey) { callbacks.onError('API Key 未配置'); return; }

    try {
      const response = await fetch(`${model.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.modelName,
          messages,
          stream: true,
          max_tokens: 1024,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        callbacks.onError(`LLM ${response.status}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { callbacks.onError('No body'); return; }

      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) { fullText += delta; callbacks.onChunk(delta); }
          } catch { /* skip */ }
        }
      }
      callbacks.onComplete(fullText);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : 'LLM 错误');
    }
  }
}
