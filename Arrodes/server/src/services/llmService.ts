/**
 * 阿罗德斯 LLM 服务
 * 支持多供应商模型切换，流式返回
 *
 * 三个公共方法（chatStream / chatSimple / chatStreamSimple）共享同一个
 * requestLlm 核心，仅系统提示词、消息截断、流式开关、max_tokens、temperature 不同。
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

interface LlmRequestOptions {
  /** 注入的系统提示词（chatSimple 用轻量版，chatStream 用完整人设） */
  systemPrompt?: string;
  /** 用户消息只取最后 N 条（chatSimple 用 4 控制成本） */
  sliceLast?: number;
  /** 是否流式 */
  stream: boolean;
  maxTokens: number;
  temperature: number;
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
    await this.requestLlm(userMessages, {
      systemPrompt: SYSTEM_PROMPT,
      stream: true,
      maxTokens: 2048,
      temperature: 0.7,
    }, callbacks);
  }

  /**
   * 简单非流式聊天（用于记忆分析等非对话场景）
   * 注意：非流式也会回调 onChunk（调用方依赖此通道收数据）
   */
  async chatSimple(
    messages: LlmMessage[],
    callbacks: LlmStreamCallbacks,
  ): Promise<void> {
    await this.requestLlm(messages, {
      systemPrompt: '你是一个 AI 助手。请简洁回复，不要多余的话。',
      sliceLast: 4,
      stream: false,
      maxTokens: 512,
      temperature: 0.3,
    }, callbacks);
  }

  /**
   * 流式聊天（简化版，无系统提示词注入，消息原样透传）
   */
  async chatStreamSimple(
    messages: LlmMessage[],
    callbacks: LlmStreamCallbacks,
  ): Promise<void> {
    await this.requestLlm(messages, {
      stream: true,
      maxTokens: 1024,
      temperature: 0.7,
    }, callbacks);
  }

  // ============================================================
  // 私有核心：统一鉴权、请求、SSE 解析
  // ============================================================

  private async requestLlm(
    messages: LlmMessage[],
    options: LlmRequestOptions,
    callbacks: LlmStreamCallbacks,
  ): Promise<void> {
    const model = getCurrentModel();
    const apiKey = getApiKeyForModel(model.id);

    if ((model.requiresKey !== false) && !apiKey) {
      callbacks.onError(`API Key 未配置（${model.apiKeyEnv}）`);
      return;
    }

    const payload: LlmMessage[] = [];
    if (options.systemPrompt) {
      payload.push({ role: 'system', content: options.systemPrompt });
    }
    const userMessages = options.sliceLast ? messages.slice(-options.sliceLast) : messages;
    payload.push(...userMessages);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (model.requiresKey !== false && apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${model.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model.modelName,
          messages: payload,
          stream: options.stream,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        callbacks.onError(`${model.provider} ${response.status}: ${errBody.slice(0, 200)}`);
        return;
      }

      if (!options.stream) {
        // 非流式：一次返回（同时回调 onChunk，兼容依赖该通道的调用方）
        const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content || '';
        callbacks.onChunk(text);
        callbacks.onComplete(text);
        return;
      }

      // 流式 SSE 解析
      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError('Response body is not readable');
        return;
      }

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
}
