const base = 'http://localhost:3002';
const sid = 'test-' + Date.now();

const cr = await fetch(base + '/api/v1/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: sid, topic: '对照实验' })
});
console.log('[1] 创建会话:', cr.status, (await cr.text()).slice(0, 200));

const msg = await fetch(base + '/api/v1/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId: sid, content: '你好，请回复"测试成功"四个字' })
});
console.log('[2] 发消息:', msg.status);
const text = await msg.text();
console.log('[3] 响应前300字:', text.slice(0, 300));
console.log('[4] 是否降级文案:', text.includes('无法连通命运之网'));
