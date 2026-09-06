/**
 * 屏幕观察结果增强（DeepSeek v4-flash）
 *
 * Mage-VL 4B 只负责「看」：输出 summary/visibleText/uncertainties/confidence 四字段。
 * 高阶判断（应用识别、用户活动、语境分类、下一步建议）由本服务调用主 LLM 推断，
 * 合并回观察 JSON 后再下发给客户端——「视觉模型管看、语言模型管想」的分工。
 *
 * 设计约束：
 * - 任何失败（无密钥/超时/解析失败）都原样返回输入，绝不阻塞观察链路；
 * - 只增强包含 "summary" 的观察 JSON，普通视觉描述不受影响。
 */

import { config } from '../config.js';
import { getLlmProvider, type LlmMessage } from './llmProvider.js';

const ENRICH_TIMEOUT_MS = 10_000;
const ENRICH_MAX_TOKENS = 300;

export interface ScreenObservationBase {
  summary?: unknown;
  visibleText?: unknown;
  uncertainties?: unknown;
  confidence?: unknown;
  [key: string]: unknown;
}

export function extractObservationJson(text: string): ScreenObservationBase | null {
  const candidate = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!candidate || !candidate.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(candidate.trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null;
    return parsed as ScreenObservationBase;
  } catch {
    return null;
  }
}

const ENRICH_SYSTEM_PROMPT = [
  '你是屏幕观察分析器。根据视觉模型对屏幕截图的描述，推断结构化信息。',
  '只依据描述中可见的证据推断；证据不足的字段必须返回 null，绝对禁止编造。',
  '聊天窗口里的图片/表情包属于聊天内容，不是正在使用的应用。',
  'contextKind 只能是 game、development、prompt、general。',
  'nextSuggestion 只给一个低风险、可撤销的下一步，证据不足时返回 null。',
  '仅返回一个 JSON 对象，不要 Markdown：',
  '{"activeApplication":"最主要的应用名称或 null","userActivity":"用户正在进行的动作或 null","contextKind":"game|development|prompt|general","currentState":"画面可证实的当前状态或 null","nextSuggestion":"一个低风险下一步或 null"}',
].join('\n');

interface EnrichedFields {
  activeApplication?: unknown;
  userActivity?: unknown;
  contextKind?: unknown;
  currentState?: unknown;
  nextSuggestion?: unknown;
}

function parseEnrichedFields(text: string): EnrichedFields | null {
  const candidate = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  if (!candidate || !candidate.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(candidate.trim());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as EnrichedFields;
  } catch {
    return null;
  }
}

export async function enrichScreenObservation(description: string): Promise<string> {
  if (config.visionEnrichment !== 'on') return description;
  if (!config.deepseekApiKey) return description;

  const base = extractObservationJson(description);
  if (!base) return description;

  try {
    const messages: LlmMessage[] = [
      { role: 'system', content: ENRICH_SYSTEM_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          summary: base.summary,
          visibleText: base.visibleText ?? [],
          uncertainties: base.uncertainties ?? [],
        }),
      },
    ];

    let enrichedText = '';
    await getLlmProvider().request(
      messages,
      {
        model: config.deepseekModel,
        baseUrl: config.deepseekBaseUrl,
        providerName: 'DeepSeek',
        apiKey: config.deepseekApiKey,
        requiresKey: true,
        stream: false,
        maxTokens: ENRICH_MAX_TOKENS,
        temperature: 0.2,
        thinkingDisabled: true,
        signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
      },
      {
        onChunk: (chunk) => { enrichedText += chunk; },
        onComplete: (fullText) => { enrichedText = fullText; },
        onError: () => { enrichedText = ''; },
      },
    );

    const enriched = parseEnrichedFields(enrichedText);
    if (!enriched) return description;

    return JSON.stringify({ ...base, ...enriched });
  } catch {
    return description;
  }
}
