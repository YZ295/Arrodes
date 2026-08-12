# 当前行为基线（2026-08-12 复核版）

记录公开接口、输入输出、副作用和已知异常。首次接入只描述现状，不修复行为。

## 公开接口

### HTTP（Express，server/src/index.ts，默认端口 3002）

| 方法 | 路径 | 输入 | 输出 |
|---|---|---|---|
| GET | `/api/health` | - | `{ status: 'ok', version: '0.1.0' }` |
| GET/POST | `/api/v1/sessions` | `?ws=` / `?archived=`；body `{ title, topic, parentId?, initialMessage?, workspaceId? }` | `{ sessions }` / 201 SessionNode |
| GET/DELETE/PATCH | `/api/v1/sessions/:id` | - / - / `{ title }` | SessionDetail / `{ deleted }` / SessionNode（404 用 `{ error, code: 'SESSION_NOT_FOUND' }`） |
| POST | `/api/v1/sessions/:id/archive` `/unarchive` `/archive-stale` | - / - / `{ days? }` | `{ archived }` / `{ unarchived }` / `{ recycled, days }` |
| GET | `/api/v1/messages/:sessionId` | - | `{ messages }` |
| GET | `/api/v1/models` | - | 模型列表（modelRegistry，含自定义模型） |
| GET | `/api/v1/vision` | - | 视觉路由（摄像头/上传） |
| GET | `/api/v1/memories` | `?q=` / `?sessionId=` | `{ memories }` |
| GET/POST | `/api/v1/tts/voices` `/synthesize` `/status` `/custom-voices` | text/voice/rate/pitch/engine/promptWav/promptText；multipart 上传音色 | 音色列表 / audioBase64 / 状态与失败统计 / 自定义音色 CRUD |
| GET | `/api/v1/usage` | - | `{ daily, monthly, allowed }` |
| GET/POST | `/api/v1/stt/status` `/transcribe` | multipart audio | `{ available }` / `{ text }` |
| GET/POST | `/api/v1/workspace` `/memories` | `?ws=` / `{ content, type?, sourceAgent? }` | 连接器 + 共享记忆 / 写共享记忆 |
| CRUD | `/api/v1/workspaces` | 工作区实体 | 列表/详情/创建/更新/归档（默认工作区不可归档） |
| GET | `/api/v1/pet/status` | - | `{ task, lastResult, busy }`（桌宠轮询） |
| GET/POST | `/api/v1/prompt-shell` | - / `{ entry }` | 外壳状态 / 版本号（含回滚） |
| GET | `/api/v1/agents` `/agents/tasks` | - | Harness 注册表 / 最近任务日志 |
| GET/POST/DELETE | `/api/v1/skills` `/skills/:name` | 自定义技能注册（webhook/replyText） | `{ skills }` / 201 / `{ ok }` 或 404 |

### WebSocket（`/v1/chat`）

- 客户端消息：`{ type: 'message', sessionId, content, isVoice, requestId?, intent? }` / `{ type: 'cancel', sessionId, requestId? }`
- 服务端消息：`chunk` / `complete` / `memory` / `stopped` / `error`（均回带 requestId）；主循环到期提醒额外广播 `{ type: 'reminder' }`
- 未知消息类型 / JSON 解析失败 → `error`；会话不存在 → `error { code: 'SESSION_NOT_FOUND' }`
- 首条 `chunk` 为空串（触发前端气泡创建）；`cancel` 中断该会话 LLM 流式推理

### 事件总线（client/src/shared/events/EventBus.ts）

- 命名空间：`universe:planet:*`、`universe:camera:arrived`、`voice:*`、`tts:play:start/end`、`nav:*`、`memory:search:request`、`app:ready`
- `on` 返回取消监听函数；监听器抛错被捕获并 console.error，不影响其他监听器

## 输入输出与数据流（WS 聊天主链路）

1. 收到 `message` → 校验会话存在 → 保存用户消息（含 isVoice）→ 更新桌宠任务 → 推送空 chunk
2. 显式记忆指令（"记住 X"/"忘了 X"）→ 直接读写记忆库，秒回不走 LLM
3. `Harness.route` 按关键词路由：dev（开发工作流）/ memory（记忆管理）/ main（默认兜底）
4. main Agent：检索记忆 + 画像 + 摘要 → LLM 流式（Token 额度前置检查）→ `<tool_call>` 技能循环（≤3 轮）→ 保存 AI 回复
5. 记忆 Agent（afterTurn）：LLM 分析对话 → 提取记忆 + 更新用户画像
6. 推送 `complete`（+ 新记忆时追加 `memory` 事件）；更新桌宠结果
7. 主循环每 30s：到期提醒推送（reminder WS 广播）+ 每 3 次 tick 记忆去重合并（Dice 相似度）

## 副作用

- SQLite（`server/data/arrodes.db`，WAL + 外键）：sessions / messages / memories / llm_usage / workspaces / workspace_members / workspace_memories
- `server/data/user_profile.json`、`data/reminders.json`、`data/custom-models.json`、`data/prompt-shell/shell.json` + 版本快照
- 自定义技能注册仅存内存，重启后 `builtin.ts` 重新注册内置技能；自定义技能重启丢失
- 生产模式（NODE_ENV=production）静态托管 client/dist + SPA fallback；`GET /` 返回 index.html

## 已知异常与风险

- 无鉴权、CORS 全开、WS 无长度限制——仅适合本地/受信网络；暴露公网可被匿名访问
- `POST /api/v1/skills` 允许注册任意 webhook URL（服务端 fetch，10s 超时）——存在 SSRF 面，且注册仅存内存
- `DELETE /api/v1/skills/:name`：custom: 前缀与内置技能均可删除（注释与行为一致）；`decodeURIComponent` 遇畸形 % 编码会抛 500
- LLM 调用失败 → 降级回复「愚者大人，阿罗德斯此刻无法连通命运之网…」，仍保存为 assistant 消息并推送 complete
- 上下文固定取最近 10 条历史（长会话截断，属设计行为）
- SQLite 无迁移脚本（initSchema 幂等建表 + 存量列补充）
- 历史遗留：早期基线引用 `assistant-x-openclaw/*` 路径已不存在（目录已迁移/删除），以实际 `Arrodes/*` 为准
