/**
 * 阿罗德斯（Arodes）后端入口
 * Express + WebSocket 服务器
 */
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { initSchema } from './db/schema.js';
import { createSessionRouter } from './routes/sessions.js';
import { createMessageRouter } from './routes/messages.js';
import { createModelRouter } from './routes/models.js';
import { createWebSocketHandler } from './ws/handler.js';
import { initModelRegistry } from './services/modelRegistry.js';
import { createVisionRouter } from './routes/vision.js';
import { createMemoryRouter } from './routes/memories.js';
import { createTtsRouter } from './routes/tts.js';
// 加载内置技能
import './skills/builtin.js';
import { getAllSkills, registerSkill, unregisterSkill } from './skills/registry.js';

const app = express();
const server = createServer(app);

// ---- 中间件 ----
app.use(cors());
app.use(express.json());

// ---- 初始化 ----
initSchema();
initModelRegistry();

// ---- 健康检查 ----
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// ---- 路由 (v1) ----
app.use('/api/v1/sessions', createSessionRouter());
app.use('/api/v1/messages', createMessageRouter());
app.use('/api/v1/models', createModelRouter());
app.use('/api/v1/vision', createVisionRouter());
app.use('/api/v1/memories', createMemoryRouter());
app.use('/api/v1/tts', createTtsRouter());

// ---- 技能管理 ----
app.get('/api/v1/skills', (_req, res) => {
  const skills = getAllSkills().map((s) => ({
    name: s.name,
    description: s.description,
    args: s.args,
  }));
  res.json({ skills });
});

// 动态添加自定义技能（webhook / 文本回复）
app.post('/api/v1/skills', (req, res) => {
  const { name, description, url, replyText } = req.body || {};
  if (!name || !description) {
    res.status(400).json({ error: 'name 和 description 必填' }); return;
  }
  if (!url && !replyText) {
    res.status(400).json({ error: 'url（webhook）或 replyText（文本回复）至少填一个' }); return;
  }

  registerSkill({
    name: `custom:${name}`,
    description,
    args: [],
    execute: async () => {
      if (url) {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
          return await r.text();
        } catch (e) { return `调用失败: ${String(e)}`; }
      }
      return replyText || '';
    },
  });

  console.log(`[Skills] 自定义技能已添加: custom:${name}`);
  res.status(201).json({ ok: true, name: `custom:${name}` });
});

// 删除技能
app.delete('/api/v1/skills/:name', (req, res) => {
  const name = req.params.name;
  if (!name || name.startsWith('custom:')) {
    // 只允许删除自定义技能和内置技能
    const deleted = unregisterSkill(name);
    if (deleted) {
      console.log(`[Skills] 已删除: ${name}`);
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: '未找到该技能' });
    }
    return;
  }
  // 内置技能：删除注册但不影响下次重启（builtin.ts 会重新注册）
  // name 可能编码了，先解码
  const decoded = decodeURIComponent(name);
  if (unregisterSkill(decoded)) {
    console.log(`[Skills] 已删除内置: ${decoded}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: '未找到该技能' });
  }
});

// ---- WebSocket ----
const wss = new WebSocketServer({ server, path: '/v1/chat' });
wss.on('connection', createWebSocketHandler);

// ---- 启动 ----
server.listen(config.port, () => {
  console.log(`[Arodes] 服务器已启动 -> http://localhost:${config.port}`);
  console.log(`[Arodes] WebSocket 路径 -> ws://localhost:${config.port}/v1/chat`);
});
