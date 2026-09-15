/**
 * 阿罗德斯视觉服务
 *
 * 默认本地 Qwen3-VL（Ollama /api/chat，模型 qwen3-vl:4b-instruct，2026-09-09 起为默认视觉引擎）。
 * 设置 VISION_PROVIDER=deepseek 可切换 DeepSeek 实验性多模态模型 deepseek-v4-flash-vision-exp
 * （OpenAI 兼容 /chat/completions + image_url base64，图片固定 384 token/张）。
 *
 * API 参考:
 * - DeepSeek Vision guide: https://api-docs.deepseek.com/guides/vision/
 * - Ollama API /api/chat（支持 images 字段）
 */

// ===== 配置 =====

const VISION_PROVIDER = (process.env.VISION_PROVIDER || 'ollama').toLowerCase();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const VISION_MODEL =
  process.env.VISION_MODEL ||
  (VISION_PROVIDER === 'deepseek' ? 'deepseek-v4-flash-vision-exp' : 'qwen3-vl:4b-instruct');

export const SUPPORTED_VISION_FORMATS = ['jpeg', 'png', 'gif', 'webp'] as const;
export const MAX_VISION_IMAGE_BYTES = 10 * 1024 * 1024;
export const VISION_REQUEST_TIMEOUT_MS = 60_000;
export const VISION_STATUS_TIMEOUT_MS = 5_000;

/**
 * 默认视觉 prompt：开放式描述 + 显式"我不知道"出口。
 * 强制产出型 prompt（不含拒答选项）会让 VLM 在信息不足时围绕仅有的像素编造——与模型无关。
 * 历史提示词测试表明，v2 在描述能力与拒答之间表现较平衡：
 *   v1 出口宽松（"认不出具体物体"）→ 有内容的截图也偷懒拒答；
 *   v2 收紧（"仅当纯噪声/纯色/空白"）→ 截图正常描述 ✓ / 噪声图得到"彩色噪点无主题"的
 *     字面描述（未编造出物体/场景/活动，危害可控）；
 *   v3 复合条件+"不要描述噪点" → 行为回退 v1；v4 拒答规则前置 → 行为回退 v1。
 *   结论：4B 贪心解码下不存在两全的措辞；真实截图是核心场景，优先保描述能力。
 *   后续增强方向（未实施）：调用方图像熵前置过滤，噪声/纯色帧直接跳过模型调用。
 * 固定短语【信息不足】保留在出口中，调用方可按前缀识别拒答；
 * 与 vision-sidecar/qwen_vl_sidecar.py 的默认 prompt 保持一致（跨进程无共享包，人工同步）。
 */
export const DEFAULT_VISION_PROMPT =
  '请详细描述这张图片中的内容，包括物体、场景、颜色、文字等。' +
  '只要能辨认出任何内容（界面、文字、图形、颜色布局），就必须直接描述，不要拒答。' +
  '仅当图片是纯噪声、纯色、全空白或完全无法辨认时，才回答：【信息不足】';

type VisionFormat = typeof SUPPORTED_VISION_FORMATS[number];

function normalizeFormat(input: string | undefined): VisionFormat | undefined {
  const format = input?.replace(/^\./, '').toLowerCase();
  const normalized = format === 'jpg' ? 'jpeg' : format;
  return SUPPORTED_VISION_FORMATS.includes(normalized as VisionFormat)
    ? normalized as VisionFormat
    : undefined;
}

function detectImageFormat(buffer: Buffer): VisionFormat | undefined {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return undefined;
}

// ===== 类型 =====

export interface VisionRequest {
  /** Base64 编码的图片数据 (不含 data:image/...;base64, 前缀) */
  imageBase64: string;
  /** 可选的图片格式提示 (如 jpeg/png) */
  imageFormat?: string;
  /** 用户提问文本，默认为 "请描述这张图片中的内容" */
  prompt?: string;
}

export interface VisionResponse {
  /** 模型生成的文本描述 */
  description: string;
  /** 推理耗时 (ms) */
  durationMs: number;
  /** 模型名 */
  model: string;
}

export interface VisionStreamCallbacks {
  onChunk: (text: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string) => void;
}

// ===== 工具函数 =====

/** 检查视觉模型是否可用（DeepSeek 查 API Key；Ollama 查本地模型） */
export async function checkVisionModel(): Promise<{
  available: boolean;
  model: string;
  provider?: string;
  state?: 'ready' | 'ok';
  device?: string;
  error?: string;
}> {
  if (VISION_PROVIDER === 'deepseek') {
    if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY.length < 10) {
      return {
        available: false,
        model: VISION_MODEL,
        error: `DEEPSEEK_API_KEY 未配置，无法使用 ${VISION_MODEL}`,
      };
    }
    return { available: true, model: VISION_MODEL };
  }

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) throw new Error(`Ollama 响应 ${res.status}`);

    const data = await res.json() as { models?: Array<{ name: string }> };
    const models = data.models || [];
    const found = models.find((m) => m.name.startsWith(VISION_MODEL));

    if (!found) {
      return {
        available: false,
        model: VISION_MODEL,
        error: `模型 ${VISION_MODEL} 未安装。请运行: ollama pull ${VISION_MODEL}`,
      };
    }

    return { available: true, model: found.name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '无法连接 Ollama';
    return { available: false, model: VISION_MODEL, error: msg };
  }
}

/** 从文件路径读取图片并转为 Base64 */
export async function imageToBase64(filePath: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(filePath);
  return buffer.toString('base64');
}

/** 从 URL 下载图片并转为 Base64 */
export async function downloadImageToBase64(url: string): Promise<{
  base64: string;
  format: string;
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const format = contentType.split('/')[1] || 'jpeg';
  return { base64: buffer.toString('base64'), format };
}

// ===== 视觉服务 =====

export class VisionService {
  /** 非流式：发送图片给视觉模型，获取完整描述 */
  async analyze(request: VisionRequest): Promise<VisionResponse> {
    const startTime = Date.now();
    const prompt = request.prompt || DEFAULT_VISION_PROMPT;

    try {
      if (VISION_PROVIDER === 'deepseek') {
        return await this.analyzeWithDeepSeek({ ...request, prompt }, startTime);
      }
      return await this.analyzeWithOllama({ ...request, prompt }, startTime);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '视觉分析失败';
      throw new Error(msg);
    }
  }

  /** 流式：发送图片给视觉模型，逐块返回描述 */
  async analyzeStream(request: VisionRequest, callbacks: VisionStreamCallbacks): Promise<void> {
    if (VISION_PROVIDER === 'deepseek') {
      await this.analyzeStreamWithDeepSeek(request, callbacks);
      return;
    }
    await this.analyzeStreamWithOllama(request, callbacks);
  }

  /** 向后兼容的基础校验。路由应使用 validateImage 同时校验格式和签名。 */
  validateBase64(base64: string): { valid: boolean; error?: string } {
    return this.validateImage(base64);
  }

  /** 校验 Base64 结构、解码大小、声明格式与二进制文件签名。 */
  validateImage(base64: string, imageFormat?: string): { valid: boolean; format?: VisionFormat; error?: string } {
    if (!base64 || base64.length < 100) return { valid: false, error: '图片数据太短，可能不完整' };
    if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      return { valid: false, error: '图片 Base64 格式无效' };
    }
    const declaredFormat = imageFormat ? normalizeFormat(imageFormat) : undefined;
    if (imageFormat && !declaredFormat) {
      return { valid: false, error: `不支持的图片格式: ${imageFormat}` };
    }
    const decoded = Buffer.from(base64, 'base64');
    if (decoded.length < 1024) return { valid: false, error: `图片数据仅 ${decoded.length} 字节，可能无效` };
    if (decoded.length > MAX_VISION_IMAGE_BYTES) return { valid: false, error: `图片超过 ${MAX_VISION_IMAGE_BYTES / 1024 / 1024}MB 限制` };
    const detectedFormat = detectImageFormat(decoded);
    if (!detectedFormat) return { valid: false, error: '图片文件签名无效或格式不受支持' };
    if (declaredFormat && detectedFormat !== declaredFormat) {
      return { valid: false, error: `图片声明格式 ${declaredFormat} 与实际内容 ${detectedFormat} 不一致` };
    }
    return { valid: true, format: detectedFormat };
  }

  // ===== DeepSeek（OpenAI 兼容 /chat/completions） =====

  private async analyzeWithDeepSeek(
    request: VisionRequest,
    startTime: number,
  ): Promise<VisionResponse> {
    const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: request.prompt },
              { type: 'image_url', image_url: { url: this.toDataUrl(request.imageBase64, request.imageFormat) } },
            ],
          },
        ],
        stream: false,
        max_tokens: 1024,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(VISION_REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DeepSeek ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data: any = await res.json();
    const description = data.choices?.[0]?.message?.content || '';

    return {
      description,
      durationMs: Date.now() - startTime,
      model: VISION_MODEL,
    };
  }

  private async analyzeStreamWithDeepSeek(
    request: VisionRequest,
    callbacks: VisionStreamCallbacks,
  ): Promise<void> {
    const prompt = request.prompt || DEFAULT_VISION_PROMPT;

    try {
      const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: this.toDataUrl(request.imageBase64, request.imageFormat) } },
              ],
            },
          ],
          stream: true,
          max_tokens: 1024,
        temperature: 0.3,
      }),
        signal: AbortSignal.timeout(VISION_REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`DeepSeek ${res.status}: ${errText.slice(0, 200)}`);
      }

      const reader = res.body?.getReader();
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
            // 跳过解析错误行
          }
        }
      }

      callbacks.onComplete(fullText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'DeepSeek 视觉流式分析失败';
      callbacks.onError(msg);
    }
  }

  // ===== Ollama（本地 Qwen3-VL） =====

  private async analyzeWithOllama(
    request: VisionRequest,
    startTime: number,
  ): Promise<VisionResponse> {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: request.prompt,
            images: [request.imageBase64],
          },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      }),
      signal: AbortSignal.timeout(VISION_REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Qwen3-VL ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data: any = await res.json();
    const description = data.message?.content || '';

    return {
      description,
      durationMs: Date.now() - startTime,
      model: VISION_MODEL,
    };
  }

  private async analyzeStreamWithOllama(
    request: VisionRequest,
    callbacks: VisionStreamCallbacks,
  ): Promise<void> {
    const prompt = request.prompt || DEFAULT_VISION_PROMPT;

    try {
      const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
          model: VISION_MODEL,
          messages: [
            {
              role: 'user',
              content: prompt,
              images: [request.imageBase64],
            },
          ],
          stream: true,
          options: {
            temperature: 0.3,
            num_predict: 1024,
        },
      }),
        signal: AbortSignal.timeout(VISION_REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Qwen3-VL ${res.status}: ${errText.slice(0, 200)}`);
      }

      const reader = res.body?.getReader();
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
          if (!trimmed) continue;

          try {
            const json = JSON.parse(trimmed);
            const content = json.message?.content || '';
            if (content) {
              fullText += content;
              callbacks.onChunk(content);
            }
            if (json.done) {
              callbacks.onComplete(fullText);
              return;
            }
          } catch {
            // 跳过解析错误行
          }
        }
      }

      callbacks.onComplete(fullText);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '视觉流式分析失败';
      callbacks.onError(msg);
    }
  }

  /** Base64 → data URL（OpenAI 兼容 image_url 需要） */
  private toDataUrl(base64: string, format?: string): string {
    const cleanFormat = (format || 'jpeg').replace(/^\./, '').toLowerCase();
    return `data:image/${cleanFormat};base64,${base64}`;
  }
}

// ===== 单例导出 =====

export const visionService = new VisionService();
