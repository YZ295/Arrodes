// 临时验证脚本：真实调用 TtsService，验证 edge TTS 修复是否生效
import { ttsService } from './src/services/ttsService.js';

const start = Date.now();
try {
  const res = await ttsService.synthesize({
    text: '你好，我是阿罗德斯。这是一次边缘语音合成测试。',
    voice: 'zh-CN-XiaoxiaoNeural',
    engine: 'edge',
  });
  const elapsed = Date.now() - start;
  console.log(JSON.stringify({
    ok: true,
    engine: res.engine,
    voice: res.voice,
    contentType: res.contentType,
    audioBytes: Math.round(res.audioBase64.length * 3 / 4),
    durationSec: Math.round(res.duration),
    elapsedMs: elapsed,
  }, null, 2));
} catch (err) {
  const elapsed = Date.now() - start;
  console.log(JSON.stringify({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    elapsedMs: elapsed,
  }, null, 2));
  process.exit(1);
}
