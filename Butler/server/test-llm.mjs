// 临时：测试 DeepSeek LLM 调用（排查思考中卡死）
import { LlmService } from './dist/services/llmService.js';

const svc = new LlmService();
console.log('开始调用 DeepSeek (chatSimple)...');
const t0 = Date.now();
let got = '';
try {
  await svc.chatSimple(
    [{ role: 'user', content: '只回复两个字：你好' }],
    {
      onChunk: (t) => { got += t; },
      onComplete: () => { console.log('onComplete 触发, 耗时', Date.now() - t0, 'ms'); },
      onError: (e) => { console.log('onError:', e); },
    }
  );
  console.log('最终文本:', JSON.stringify(got.slice(0, 120)));
} catch (e) {
  console.log('异常:', e.message);
}
