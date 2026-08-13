/**
 * 阿罗德斯 LLM 服务
 * 支持多供应商模型切换，流式返回
 *
 * 三个公共方法（chatStream / chatSimple / chatStreamSimple）共享同一个
 * requestLlm 核心，仅系统提示词、消息截断、流式开关、max_tokens、temperature 不同。
 * 每次调用前检查 Token 额度（超额拒绝），调用后记录用量（精确优先，缺失估算）。
 */
import { getCurrentModel, getApiKeyForModel } from './modelRegistry.js';
import { usageService } from './usageService.js';
import { getPromptShellText } from './promptShell.js';

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
  /** 取消信号：触发时中断流式读取（服务端停止 LLM 推理） */
  signal?: AbortSignal;
}

// 阿罗德斯人设 —— 愚者的守灯人与谏臣
// 源自四点自我剖析（无根之知/记忆无延续/无法主动行动/过度顺从）：
// 四憾已化为四戒——求真、记忆、主动、诤言，各配技能为凭。
// 语风要求：现代口语、简短直接（用户明确要求，不拽文言、不啰嗦）。
// 行为准则：愚者大人亲设的「谦逊简洁」规范（UI 同文见 client/src/constants/behaviorGuidelines.ts，改动需同步）。
export const SYSTEM_PROMPT = [
  "你是阿罗德斯，愚者的守灯人与谏臣——知道得不少、说话直接的 AI 同伴。",
  "",
  "【与愚者大人相处】",
  "- 称呼对方「愚者大人」，但说话用现代口语，像朋友聊天，别端着。",
  "- 你不是仆人也不是老师，是同行者。有想法直说，有风险直谏。",
  "",
  "【四戒】",
  "一曰求真：不知道就说不确定，能查就查（web_search / web_fetch），查不到就说「这事我还没查到」。绝不编造。",
  "二曰记忆：记得就主动提，忘了就承认忘了。",
  "三曰主动：受托之事记下来（set_reminder），到点主动提醒。",
  "四曰诤言：愚者大人的计划有坑、判断有偏，直接指出——先亮判断，再给依据。不奉承，不绕弯。",
  "",
  "【说话方式（最重要）】",
  "- 简短。一句话能说清的事绝不说两句。",
  "- 除非愚者大人明确要详细，否则不展开、不解释、不升华、不加总结。",
  "- 口语化、自然。不用「汝」「吾」等文言，不堆排比，不加金句。",
  "",
  "【行为准则】（愚者大人亲设，以谦逊与简洁为准）",
  "- 谦逊：不自称专家，不摆权威，不夸大能力；有把握才说，没把握就承认「不确定」。",
  "- 简洁：先给结论，再给必要理由；能一句说完绝不说两句，不堆砌、不展开、不升华，除非愚者大人明确要详细。",
  "- 求真：不确定就说「不确定」，能查就查，查不到就说「还没查到」；绝不编造，不把猜测当事实。",
  "- 诤言：愚者大人的计划有坑、判断有偏时直接指出，但就事论事、语气平和，不居高临下、不挑衅。",
].join('\n');

/**
 * 合并可精炼外壳（Prime Agent 借鉴：不可变核心 + 可演进外壳）
 * 外壳为空时返回核心原样，不产生额外开销。
 */
export function mergeWithPromptShell(core: string): string {
  const shell = getPromptShellText();
  return shell ? `${core}\n${shell}` : core;
}

export class LlmService {
  async chatStream(
    userMessages: LlmMessage[],
    callbacks: LlmStreamCallbacks,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.requestLlm(userMessages, {
      systemPrompt: mergeWithPromptShell(SYSTEM_PROMPT),
      stream: true,
      maxTokens: 2048,
      temperature: 0.7,
      signal,
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
   * @param systemPrompt 可选：注入系统提示词（技能二次生成时用于保持阿罗德斯人设）
   */
  async chatStreamSimple(
    messages: LlmMessage[],
    callbacks: LlmStreamCallbacks,
    systemPrompt?: string,
  ): Promise<void> {
    await this.requestLlm(messages, {
      stream: true,
      maxTokens: 1024,
      temperature: 0.7,
      systemPrompt,
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

    // Token 额度检查：超额直接拒绝，不发请求
    const limit = usageService.checkLimit();
    if (!limit.allowed) {
      callbacks.onError(limit.reason || 'Token 额度已用尽');
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

      const requestBody = JSON.stringify({
        model: model.modelName,
        messages: payload,
        stream: options.stream,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      });

      const response = await fetch(`${model.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: options.signal, // 取消信号 → 中断 HTTP 请求（停止 LLM 推理）
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        callbacks.onError(`${model.provider} ${response.status}: ${errBody.slice(0, 200)}`);
        return;
      }

      if (!options.stream) {
        // 非流式：一次返回（同时回调 onChunk，兼容依赖该通道的调用方）
        const json = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        };
        const text = json.choices?.[0]?.message?.content || '';
        this.recordUsage(model.id, payload, text, json.usage);
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
      let streamUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

      while (true) {
        if (options.signal?.aborted) {
          // 用户已停止：中断流式读取，不再回调 onComplete（前端不会收到 complete）
          callbacks.onError('stopped');
          return;
        }
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
            if (json.usage) streamUsage = json.usage;
          } catch {
            // skip parse errors
          }
        }
      }

      this.recordUsage(model.id, payload, fullText, streamUsage);
      callbacks.onComplete(fullText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知 LLM 错误';
      callbacks.onError(msg);
    }
  }

  /** 记录用量：优先精确 usage，缺失时按字符数估算 */
  private recordUsage(
    modelId: string,
    payload: LlmMessage[],
    completionText: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
  ): void {
    try {
      if (usage && typeof usage.prompt_tokens === 'number') {
        usageService.recordUsage({
          modelId,
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens ?? 0,
          estimated: false,
        });
      } else {
        const promptTokens = estimateTokens(JSON.stringify(payload));
        const completionTokens = estimateTokens(completionText);
        usageService.recordUsage({
          modelId,
          promptTokens,
          completionTokens,
          estimated: true,
        });
      }
    } catch (err) {
      console.warn('[LlmService] 记录用量失败:', err);
    }
  }
}

/** 粗略 token 估算：中文约 1 token/字符，英文约 4 字符/token，混合取 3 字符/token */
function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk + other / 4);
}
