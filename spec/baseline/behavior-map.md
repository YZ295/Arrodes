# 当前行为基线

记录公开接口、输入输出、副作用和已知异常。首次接入只描述现状，不修复行为。

## 公开接口

### HTTP（Express，`server/src/index.ts`）

| 方法 | 路径 | 输入 | 输出 |
|---|---|---|---|
| GET | `/api/health` | - | `{ status: 'ok', version: '0.1.0' }` |
| GET | `/api/v1/sessions` | - | `{ sessions: SessionNode[] }` |
| POST | `/api/v1/sessions` | `{ title, topic, parentId?, initialMessage? }`，title 1-200 字符、topic 枚举校验 | 201 + `SessionNode` |
| GET | `/api/v1/sessions/:id` | - | `SessionDetail` 或 404 `{ error, code: 'SESSION_NOT_FOUND' }` |
| PATCH | `/api/v1/sessions/:id` | `{ title }`（1-200 字符校验） | 重命名后的 `SessionNode` 或 404 |
| DELETE | `/api/v1/sessions/:id` | - | `{ deleted, id }` |
| GET | `/api/v1/messages/:sessionId` | - | `{ messages: Message[] }` |
| GET | `/api/v1/models` | - | 模型列表（modelRegistry） |
| GET | `/api/v1/vision` / `/api/v1/memories` / `/api/v1/tts` | - | 各自路由（vision/memories/tts） |
| GET | `/api/v1/skills` | - | `{ skills: [{ name, description, args }] }` |
| POST | `/api/v1/skills` | `{ name, description, url? | replyText? }`，url 与 replyText 至少一个 | 201 `{ ok, name: 'custom:<name>' }` 或 400 |
| DELETE | `/api/v1/skills/:name` | - | `{ ok }` 或 404 |

### WebSocket（`/v1/chat`）

- 客户端消息：`{ type: 'message', sessionId, content, isVoice, intent? }`
- 服务端消息：`chunk`（流式增量 `{ content }`）、`complete`（`{ content, memories, intent? }`）、`memory`（`{ memories }`）、`error`（`{ error, code? }`）
- 未知消息类型 / JSON 解析失败 → `error`；会话不存在 → `error { code: 'SESSION_NOT_FOUND' }`
- 首条 `chunk` 为空串，用于触发前端消息气泡创建

### 事件总线（`client/src/shared/events/EventBus.ts`）

- 命名空间：`universe:planet:*`（click/doubleclick/spawned）、`universe:camera:arrived`、`voice:*`（recording:start/end、message:send、reply:complete、session:create、session:switch、intent:action）、`nav:*`（search/list:select）、`app:ready`
- `on` 返回取消监听函数；监听器抛错被捕获并 console.error，不影响其他监听器

## 输入输出与数据流（WS 聊天主链路）

1. 收到 `message` → 校验会话存在 → 保存用户消息（含 isVoice）
2. `MemoryGateway.retrieveContext` 检索记忆 + 用户画像
3. 构建 LLM 上下文：画像（system）→ 相关记忆（system）→ 技能提示（system）→ 最近 10 条历史
4. DeepSeek 流式生成，25s 超时保护（超时追加「阿罗德斯尚在参悟…」文案）
5. 技能调用循环：解析 `<tool_call>` → 执行 → 注入结果二次调用 LLM，最多 3 轮
6. 保存 AI 回复、更新会话 lastActive、`processConversation` 提取新记忆
7. 推送 `complete`，有新记忆时追加 `memory` 事件

## 副作用

- 会话/消息/记忆写入 SQLite（`server/data/arrodes.db`，WAL 模式）
- 用户画像写入 `server/data/user_profile.json`
- 自定义技能注册只存内存（`skills/registry.ts`），重启后 `builtin.ts` 重新注册内置技能；自定义技能重启丢失
- 服务端启动时 `initSchema()` + `initModelRegistry()`，无迁移机制（schema.ts 直接建表）

## 已知异常

- LLM 调用失败 → 降级回复「愚者大人，阿罗德斯此刻无法连通命运之网…」，仍保存为 assistant 消息并推送 complete
- WS `error` 事件仅打日志，不主动断开连接
- `DELETE /api/v1/skills/:name` 的 `name.startsWith('custom:')` 判断与注释意图不符（注释称仅允许删除自定义技能，条件分支实际会走到 `unregisterSkill(name)`），行为待实测确认
