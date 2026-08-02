import WebSocket from 'ws';

const base = 'http://localhost:3002';

const cr = await fetch(base + '/api/v1/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '对照实验', topic: 'work' })
});
const session = await cr.json();
console.log('[1] 创建会话:', cr.status, 'id=', session.id);

const ws = new WebSocket('ws://localhost:3002/v1/chat');
let full = '';
const timeout = setTimeout(() => {
  console.log('[FAIL] 60s 超时未收到 complete');
  console.log('[收到内容]', full.slice(0, 300));
  process.exit(2);
}, 60000);

ws.on('open', () => {
  console.log('[2] WS 已连接');
  ws.send(JSON.stringify({ type: 'message', sessionId: session.id, content: '你好，请回复"测试成功"四个字即可' }));
  console.log('[3] 消息已发送');
});

ws.on('message', (raw) => {
  const evt = JSON.parse(raw.toString());
  if (evt.type === 'chunk') { full += evt.data.content; }
  else if (evt.type === 'complete') {
    clearTimeout(timeout);
    console.log('[4] complete 收到, 总长:', full.length);
    console.log('[5] 回复:', JSON.stringify(full.slice(0, 400)));
    console.log('[6] 降级文案?', full.includes('无法连通命运之网'));
    ws.close();
    process.exit(0);
  }
  else if (evt.type === 'error') {
    clearTimeout(timeout);
    console.log('[ERROR]', JSON.stringify(evt));
    process.exit(3);
  }
});

ws.on('error', (e) => { clearTimeout(timeout); console.log('[WS ERROR]', e.message); process.exit(4); });
