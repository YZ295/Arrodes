/**
 * 阿罗德斯视觉服务
 * 调用本地 Qwen3-VL (Ollama) 进行多模态视觉理解
 *
 * API 参考: Ollama API /api/chat (支持 images 字段)
 * 模型: qwen3-vl:4b (约 3.3GB, RTX 4060 4-5GB 显存)
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ===== 配置 =====

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const VISION_MODEL = process.env.VISION_MODEL || 'qwen3-vl:4b-instruct';
const UPLOAD_DIR = process.env.VISION_UPLOAD_DIR || './uploads/vision';

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

/** 检查 Ollama 是否在线且指定模型已加载 */
export async function checkVisionModel(): Promise<{
  available: boolean;
  model: string;
  error?: string;
}> {
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
  /**
   * 非流式：发送图片给 Qwen3-VL，获取完整描述
   */
  async analyze(
    request: VisionRequest,
  ): Promise<VisionResponse> {
    const startTime = Date.now();
    const prompt = request.prompt || '请详细描述这张图片中的内容，包括物体、场景、颜色、文字等。';

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
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 1024,
          },
        }),
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : '视觉分析失败';
      throw new Error(msg);
    }
  }

  /**
   * 流式：发送图片给 Qwen3-VL，逐块返回描述
   */
  async analyzeStream(
    request: VisionRequest,
    callbacks: VisionStreamCallbacks,
  ): Promise<void> {
    const prompt = request.prompt || '请详细描述这张图片中的内容。';

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

  /**
   * 安全的 Base64 校验：确保图片数据可用
   */
  validateBase64(base64: string): { valid: boolean; error?: string } {
    if (!base64 || base64.length < 100) {
      return { valid: false, error: '图片数据太短，可能不完整' };
    }

    // 检查是否为有效的 Base64
    try {
      const decoded = Buffer.from(base64, 'base64');
      if (decoded.length < 1024) {
        return { valid: false, error: `图片数据仅 ${decoded.length} 字节，可能无效` };
      }
      return { valid: true };
    } catch {
      return { valid: false, error: 'Base64 解码失败' };
    }
  }
}

// ===== 单例导出 =====

export const visionService = new VisionService();
