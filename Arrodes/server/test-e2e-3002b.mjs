const base = 'http://localhost:3002';
const cr = await fetch(base + '/api/v1/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: 'test-' + Date.now(), title: '对照实验' })
});
console.log('[1] 创建会话:', cr.status);
console.log('[2] 响应体:', (await cr.text()).slice(0, 500));

const hr = await fetch(base + '/api/v1/health', { method: 'GET' });
console.log('[3] health:', hr.status, (await hr.text()).slice(0, 200));

const lr = await fetch(base + '/api/v1/sessions', { method: 'GET' });
console.log('[4] 列表:', lr.status, (await lr.text()).slice(0, 300));
