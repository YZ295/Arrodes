/**
 * 阿罗德斯 TTS 服务 v2
 *
 * 使用 WebSocket 调用 Microsoft Edge TTS 免费服务。
 * 参考 edge-tts (Python) 的实现。
 *
 * 协议流程：
 * 1. WSS 连接 → speech.platform.bing.com
 * 2. 发送 speech.config（指定输出格式）
 * 3. 发送 SSML（指定文本和音色）
 * 4. 接收二进制音频片段
 * 5. 拼接返回
 */
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

// ===== 配置 =====

const EDGE_TTS_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const TRUSTED_CLIENT_TOKEN = '6A84B7B5-2D45-4F1E-9E1C-5E3B7C7D8E9F';
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

// ===== 类型 =====

export type TtsEngine = 'edge' | 'web';

export interface TtsRequest {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  engine?: TtsEngine;
}

export interface TtsResponse {
  audioBase64: string;
  contentType: string;
  engine: TtsEngine;
  voice: string;
  duration: number;
}

// ===== Edge TTS WebSocket 合成 =====

function synthesizeEdge(
  text: string,
  voice: string,
  rate: number,
  pitch: number,
): Promise<{ audioBase64: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const connectionId = randomUUID().replace(/-/g, '');
    const wsUrl = `${EDGE_TTS_WS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdgdglndjomblegje',
      },
    });

    const audioChunks: Buffer[] = [];
    const requestId = randomUUID().replace(/-/g, '');
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { ws.close(); } catch {}
        reject(new Error('Edge TTS 超时'));
      }
    }, 15000);

    ws.on('open', () => {
      // 1. 发送配置
      const configMsg = [
        `X-Timestamp:${new Date().toISOString()}`,
        'Content-Type:application/json; charset=utf-8',
        'Path:speech.config',
        '',
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'true' },
                outputFormat: OUTPUT_FORMAT,
              },
            },
          },
        }),
      ].join('\r\n');
      ws.send(configMsg);

      // 2. 发送 SSML
      const ratePercent = ((rate - 1) * 100).toFixed(0);
      const pitchPercent = ((pitch - 1) * 50).toFixed(0);
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody rate='${ratePercent}%' pitch='${pitchPercent}%'>${escapeXml(text)}</prosody></voice></speak>`;

      const ssmlMsg = [
        `X-RequestId:${requestId}`,
        'Content-Type:application/ssml+xml;charset=UTF-8',
        `X-Timestamp:${new Date().toISOString()}`,
        'Path:ssml',
        '',
        ssml,
      ].join('\r\n');
      ws.send(ssmlMsg);
    });

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (resolved) return;

      if (isBinary) {
        // 二进制消息 = 音频数据
        // 前 2 字节是 header length
        if (data.length > 2) {
          const headerLen = data.readUInt16BE(0);
          const audioData = data.subarray(2 + headerLen);
          if (audioData.length > 0) {
            audioChunks.push(Buffer.from(audioData));
          }
        }
      } else {
        // 文本消息
        const msg = data.toString();
        if (msg.includes('Path:turn.end')) {
          // 合成完成
          resolved = true;
          clearTimeout(timeout);
          ws.close();
          const audioBuffer = Buffer.concat(audioChunks);
          if (audioBuffer.length === 0) {
            reject(new Error('Edge TTS 返回空音频'));
          } else {
            resolve({
              audioBase64: audioBuffer.toString('base64'),
              contentType: 'audio/mpeg',
            });
          }
        } else if (msg.includes('Path:response')) {
          // 收到响应头，继续等待音频
        } else if (msg.includes('Path:audio.metadata')) {
          // 元数据，忽略
        }
      }
    });

    ws.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error(`Edge TTS WebSocket 错误: ${err.message}`));
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (audioChunks.length > 0) {
          const audioBuffer = Buffer.concat(audioChunks);
          resolve({
            audioBase64: audioBuffer.toString('base64'),
            contentType: 'audio/mpeg',
          });
        } else {
          reject(new Error('Edge TTS 连接关闭但无音频数据'));
        }
      }
    });
  });
}

// ===== 服务类 =====

export class TtsService {
  async synthesize(request: TtsRequest): Promise<TtsResponse> {
    const { text, voice = DEFAULT_VOICE, rate = 1.0, pitch = 1.0, engine = 'edge' } = request;

    if (!text || !text.trim()) throw new Error('文本不能为空');
    if (text.length > 2000) throw new Error('文本过长（最大 2000 字）');

    switch (engine) {
      case 'edge': {
        const result = await synthesizeEdge(text, voice, rate, pitch);
        const estimatedDuration = text.length / 4;
        return { ...result, engine: 'edge', voice, duration: estimatedDuration };
      }
      default:
        throw new Error(`不支持的 TTS 引擎: ${engine}`);
    }
  }

  getVoices(): Array<{ id: string; name: string; gender: string; style: string }> {
    return [
      { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 (女声·轻柔)', gender: 'female', style: '温柔、自然' },
      { id: 'zh-CN-XiaoyiNeural', name: '晓伊 (女声·可爱)', gender: 'female', style: '活泼、俏皮' },
      { id: 'zh-CN-XiaorouNeural', name: '晓柔 (女声·纯欲)', gender: 'female', style: '温柔、抚慰' },
      { id: 'zh-CN-YunyangNeural', name: '云扬 (男声·管家)', gender: 'male', style: '沉稳、可靠' },
      { id: 'zh-CN-YunjianNeural', name: '云健 (男声·神秘)', gender: 'male', style: '磁性、故事感' },
    ];
  }
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export const ttsService = new TtsService();
