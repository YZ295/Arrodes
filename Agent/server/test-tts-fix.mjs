// 临时验证脚本 v2：完全按 edge-tts master 实现（token / Sec-MS-GEC / muid / headers）
// 验证后可删除，不进入正式代码
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

const EDGE_TTS_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SEC_MS_GEC_VERSION = '1-143.0.3650.75';
const WIN_EPOCH = 11644473600n;

// 对齐 edge-tts drm.py：unix 秒 + WIN_EPOCH → 向下取整到 300 秒 → 乘 1e7 → 拼 token → SHA256 大写 hex
function generateSecMsGec() {
  let ticks = BigInt(Math.floor(Date.now() / 1000));
  ticks += WIN_EPOCH;
  ticks -= ticks % 300n;
  ticks *= 10000000n;
  const input = `${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`;
  return createHash('sha256').update(input, 'ascii').digest('hex').toUpperCase();
}

// muid：32 位大写 hex（edge-tts drm.generate_muid）
function generateMuid() {
  return randomBytes(16).toString('hex').toUpperCase();
}

function synthesize(text) {
  return new Promise((resolve, reject) => {
    const connectionId = randomUUID().replace(/-/g, '');
    const wsUrl =
      `${EDGE_TTS_WS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${generateSecMsGec()}` +
      `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
      `&ConnectionId=${connectionId}`;

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Sec-WebSocket-Version': '13',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `muid=${generateMuid()};`,
      },
    });

    const chunks = [];
    const requestId = randomUUID();
    let done = false;
    const timeout = setTimeout(() => {
      done = true;
      try { ws.close(); } catch {}
      reject(new Error('timeout'));
    }, 20000);

    ws.on('open', () => {
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
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        }),
      ].join('\r\n');
      ws.send(configMsg);

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='zh-CN-XiaoxiaoNeural'><prosody rate='0%' pitch='0%'>${text}</prosody></voice></speak>`;
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

    ws.on('message', (data, isBinary) => {
      if (done) return;
      if (isBinary) {
        if (data.length > 2) {
          const headerLen = data.readUInt16BE(0);
          const audioData = data.subarray(2 + headerLen);
          if (audioData.length > 0) chunks.push(Buffer.from(audioData));
        }
      } else {
        const msg = data.toString();
        console.log(`[text] ${msg.split('\r\n').slice(0, 8).join(' | ')}`);
        if (msg.includes('Path:turn.end')) {
          done = true;
          clearTimeout(timeout);
          ws.close();
          const buf = Buffer.concat(chunks);
          if (buf.length === 0) reject(new Error('empty audio'));
          else resolve(buf);
        }
      }
    });

    ws.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', (code, reason) => {
      console.log(`[close] code=${code} reason=${reason.toString()}`);
      if (done) return;
      done = true;
      clearTimeout(timeout);
      if (chunks.length > 0) resolve(Buffer.concat(chunks));
      else reject(new Error('closed without audio'));
    });
  });
}

try {
  const audio = await synthesize('你好，这是一次语音合成测试。');
  console.log(`OK audioBytes=${audio.length} base64Len=${audio.toString('base64').length}`);
} catch (err) {
  console.log(`FAIL: ${err.message}`);
  process.exitCode = 1;
}
