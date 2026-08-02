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
import { randomUUID, createHash } from 'node:crypto';
import { WebSocket } from 'ws';

// ===== 配置 =====

const EDGE_TTS_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
// 2026-08 验证过的 TrustedClientToken（2025-12 微软换过令牌，旧值 401）
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';
const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

// ===== Sec-MS-GEC 生成 =====
// 微软规则：Windows 文件时间（1601-01-01 起，100ns 单位）按 300 秒对齐后，
// 以十进制字符串拼接 TrustedClientToken，再 SHA256 大写。
// 参考 edge-tts master 的 generate_sec_ms_gec（2026-08 实测十六进制版已被 403）。
function generateSecMsGec(): string {
  const WIN_EPOCH_SECONDS = BigInt(11644473600); // 1601-01-01 → 1970-01-01 秒差
  const unixSeconds = BigInt(Math.floor(Date.now() / 1000));
  let ticks = unixSeconds + WIN_EPOCH_SECONDS; // Windows 文件时间（秒）
  ticks -= ticks % 300n; // 对齐 5 分钟
  ticks *= 10000000n; // 秒 → 100ns 间隔
  const str = `${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`;
  return createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

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
    // Sec-MS-GEC 必须放在 URL query 里，放 header 会被 403
    const wsUrl = `${EDGE_TTS_WS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connectionId}`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'User-Agent': EDGE_UA,
        'Origin': EDGE_ORIGIN,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': 'muid=',
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
    }, 30000);

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
        'Content-Type:application/ssml+xml',
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
    // 超长文本截断：Edge 合成 800+ 字需 10s+，过长易中断/超时，朗读前 1000 字
    const speakText = text.length > 1000 ? text.slice(0, 1000) : text;

    switch (engine) {
      case 'edge': {
        // 最多尝试 3 次（Edge TTS 国内网络间歇性失败，间隔 1s 重试）
        let result;
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            result = await synthesizeEdge(speakText, voice, rate, pitch);
            break;
          } catch (err) {
            lastErr = err;
            if (attempt < 3) {
              console.warn(`[TTS] Edge 合成失败（第 ${attempt} 次），1s 后重试:`, err instanceof Error ? err.message : err);
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }
        if (!result) throw lastErr;
        const estimatedDuration = speakText.length / 4;
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
