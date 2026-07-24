/**
 * 阿罗德斯（Arodes）后端入口
 * Express + WebSocket 服务器
 */
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { createSessionRouter } from './routes/sessions.js';
import { createMessageRouter } from './routes/messages.js';
import { createWebSocketHandler } from './ws/handler.js';

const app = express();
const server = createServer(app);

// ---- 中间件 ----
app.use(cors());
app.use(express.json());

// ---- 健康检查 ----
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// ---- 路由 (v1) ----
app.use('/api/v1/sessions', createSessionRouter());
app.use('/api/v1/messages', createMessageRouter());

// ---- WebSocket ----
const wss = new WebSocketServer({ server, path: '/v1/chat' });
wss.on('connection', createWebSocketHandler);

// ---- 启动 ----
server.listen(config.port, () => {
  console.log(`[Arodes] 服务器已启动 -> http://localhost:${config.port}`);
  console.log(`[Arodes] WebSocket 路径 -> ws://localhost:${config.port}/v1/chat`);
});
