/**
 * 阿罗德斯（Arodes）后端入口
 * Express + WebSocket 服务器
 */
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { createUsageRouter } from './routes/usage.js';
import { createSttRouter } from './routes/stt.js';
import { createWorkspaceRouter } from './routes/workspace.js';
import { createWorkspacesRouter } from './routes/workspaces.js';
import { createPetRouter } from './routes/pet.js';
import { createPromptShellRouter } from './routes/promptShell.js';
import { createActionsRouter } from './routes/actions.js';
import { harness } from './harness/harness.js';
import { classifyAction } from './services/actionGate.js';
// 加载内置技能
import './skills/builtin.js';
// 电脑操作技能（正式版，后注册覆盖同名试探版）
import './skills/computer.js';
// 联网检索技能（治"无根之知"）
import './skills/web.js';
// 定时提醒技能（治"无法主动行动"）
import './skills/reminder.js';
// 开发工作流技能族（grill-me / to-spec / to-tickets / implement / code-review / improve-architecture）
import './skills/devworkflow.js';
// 天气查询技能（HoloJarvis 借鉴：Open-Meteo 免 key）
import './skills/weather.js';
// 桌面操控技能族（Daisy/HoloJarvis 借鉴，分级授权）
import './skills/desktop.js';
// 浏览器/站内搜索直达技能
import './skills/browser.js';
// MCP 生态接入技能（MCP_SERVERS 环境变量配置）
import './skills/mcp.js';
// 文件操作技能族（read/write/create/delete/list/move/copy，统一 actionGate）
import './skills/files.js';
import { getAllSkills, registerSkill, unregisterSkill } from './skills/registry.js';
import { startMainloop } from './services/mainloop.js';

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
app.use('/api/v1/usage', createUsageRouter());
app.use('/api/v1/stt', createSttRouter());
app.use('/api/v1/workspace', createWorkspaceRouter());
app.use('/api/v1/pet', createPetRouter());
app.use('/api/v1/prompt-shell', createPromptShellRouter());
app.use('/api/v1/workspaces', createWorkspacesRouter());
app.use('/api/v1/actions', createActionsRouter());

// ---- 多 Agent 展示（Harness）----
app.get('/api/v1/agents', (_req, res) => {
  res.json({ agents: harness.listAgents() });
});

app.get('/api/v1/agents/tasks', (_req, res) => {
  res.json({ tasks: harness.getRecentTasks() });
});

// ---- 技能管理 ----
app.get('/api/v1/skills', (_req, res) => {
  const skills = getAllSkills().map((s) => ({
    name: s.name,
    description: s.description,
    args: s.args,
    risk: classifyAction(s.name),
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

// ---- 生产模式静态托管（desktop-shell）----
// 仅 NODE_ENV=production 时托管 client 构建产物，并做 SPA fallback；
// /api 与 /v1/chat 路径保持原样，绝不回退到 index.html。
if (config.nodeEnv === 'production') {
  const distDefault = resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  const staticDir = process.env.CLIENT_DIST ? resolve(process.env.CLIENT_DIST) : distDefault;
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^\/(?!api(?:$|\/)|v1\/chat(?:$|\/)).*/, (_req, res) => {
      res.sendFile(resolve(staticDir, 'index.html'));
    });
    console.log(`[Arodes] 静态托管已启用 -> ${staticDir}`);
  } else {
    console.warn(`[Arodes] 静态目录不存在，跳过托管: ${staticDir}`);
  }
}

// ---- WebSocket ----
const wss = new WebSocketServer({ server, path: '/v1/chat' });
wss.on('connection', createWebSocketHandler);

// ---- 启动 ----
server.listen(config.port, () => {
  console.log(`[Arodes] 服务器已启动 -> http://localhost:${config.port}`);
  console.log(`[Arodes] WebSocket 路径 -> ws://localhost:${config.port}/v1/chat`);
});

// ---- 主循环（BaiLongma 借鉴：空闲心跳 + 提醒推送 + 主动记忆整理） ----
startMainloop(wss);
