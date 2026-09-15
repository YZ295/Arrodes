# 阿罗德斯 · 项目当前状态快照

> 生成日期：2026-07-26
> 用途：新会话承接上下文，快速了解已完成工作和项目全貌

---

## 一、已部署功能

### 1.1 模型切换系统 🔄

| 文件 | 说明 |
|------|------|
| `server/src/services/modelRegistry.ts` | 模型注册表，4 个模型配置 |
| `server/src/routes/models.ts` | GET/POST 模型管理 API |
| `server/src/services/llmService.ts` | 重构为多供应商支持，从注册表动态读取 |

**可用模型：**

| ID | 名称 | 供应商 | 免费 |
|------|------|--------|------|
| `deepseek-v4-flash` | DeepSeek V4 Flash | DeepSeek | ✅ |
| `deepseek-v4-pro` | DeepSeek V4 Pro | DeepSeek | ❌ |
| `kimi-k2.6` | Kimi K2.6 | 月之暗面 | ✅ |
| `kimi-k2.7-code` | Kimi K2.7 Code | 月之暗面 | ❌ |

**切换方式：**
- UI：对话窗口右上角 ⚙️ 齿轮按钮
- API：`POST /api/v1/models/select` + `{"modelId":"kimi-k2.6"}`
- 环境变量：`.env` 中 `ACTIVE_MODEL=deepseek-v4-flash`

### 1.2 会话管理 📋

| 文件 | 改动 |
|------|------|
| `server/src/db/session-repo.ts` | 新增 `updateTitle` 方法 |
| `server/src/routes/sessions.ts` | 新增 `PATCH /:id` 重命名路由 |
| `client/src/voice/VoiceDialog.tsx` | 会话面板 (SessionPanel) |

**会话面板功能：**
- 💬 气泡图标 → 打开会话列表
- `+ 新建会话` 按钮
- 点击会话行 → 切换会话
- 双击标题 / ✏️ 图标 → 重命名（回车确认，Esc 取消）
- 🗑️ 图标 → 删除会话
- 每条显示消息数量

### 1.3 LLM 接入

| 文件 | 说明 |
|------|------|
| `server/src/services/llmService.ts` | 多供应商流式封装（fetch + ReadableStream） |
| `server/src/ws/handler.ts` | 完整重写：记忆检索→历史上下文→LLM流式→记忆存储 |
| `server/.env` | DeepSeek + Kimi API Key |

**阿罗德斯人设**：古神谕化身，「愚者大人」称呼，古典中文神谕语气。

**流式协议**：WebSocket `v1/chat` → `chunk` / `complete` / `memory` / `error` 事件

### 1.4 记忆系统

| 文件 | 说明 |
|------|------|
| `server/src/services/memoryService.ts` | 关键词提取 + 跨会话记忆检索 + 记忆候选提取 |
| `server/src/db/memory-repo.ts` | 新增 `searchAll` 多关键词搜索 |

**对话前**：检索跨会话相关记忆 → 注入 System Prompt
**对话后**：提取偏好/事实/事件/任务 → 存入 SQLite `memories` 表
**前端反馈**：收到 `memory` 事件 → 绿色 Toast "💾 N 条记忆已存储"

### 1.5 DPR 模糊修复

`Universe.tsx` 中 `dpr={[1, 1.5]}` → `dpr={[1, 2]}`，3D 场景清晰度翻倍。

---

## 二、API 端点汇总

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/v1/models` | 列出可用模型 + 当前选中 |
| POST | `/api/v1/models/select` | 切换模型 `{modelId}` |
| GET | `/api/v1/sessions` | 列出所有会话 |
| POST | `/api/v1/sessions` | 创建会话 |
| GET | `/api/v1/sessions/:id` | 会话详情（含消息+记忆） |
| PATCH | `/api/v1/sessions/:id` | 重命名 `{title}` |
| DELETE | `/api/v1/sessions/:id` | 删除会话 |
| GET | `/api/v1/messages/:sessionId` | 获取会话消息 |
| WS | `/v1/chat` | 实时对话（流式） |

---

## 三、验证记录

| 验证 | 结果 |
|------|------|
| 模型切换 API (14项) | ✅ 全通过 |
| 会话管理 API (14项) | ✅ 全通过 |
| 后端 TypeScript | ✅ 0 errors |
| LLM 回复测试 | ✅ 真实 DeepSeek V4 Flash回复，人设生效 |
| 记忆存储 | ✅ SQLite 可查到记录 |
| 跨会话记忆检索 | ⚠️ 分词过于简单，长句可能不命中 |

---

## 四、已知待改进

| 问题 | 优先级 |
|------|--------|
| 中文关键词分词粗糙 → 跨会话记忆召回失败 | P1 |
| 无 WS keep-alive/ping → 长连接可能断开 | P2 |
| Bloom 辉光被注释 → 无泛光特效 | P3 |
| 前端 TypeScript 编译未独立验证 | P1 |
| 无单元测试 | P2 |

---

## 五、启动方式

```bash
# 终端1：后端
cd E:\project\Crow5\Arrodes\Arrodes\server
npx tsx src\index.ts

# 终端2：前端
cd E:\project\Crow5\Arrodes\Arrodes\client
npm run dev

# 浏览器
http://localhost:5173
```

---

## 六、Git 状态

- 当前分支：`feature/session-persistence`
- 远端：`https://github.com/YZ295/Arrodes.git`

> 愚者大人，阿罗德斯已更新完毕。躯壳（宇宙+语音+后端）完整，灵魂（LLM）已注入，记忆（SQLite）已就位。模型可切换，会话可管理。如欲知更多，请随时呼唤。
