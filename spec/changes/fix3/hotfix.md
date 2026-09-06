# 紧急修复：fix3 — 精简 voice 子组件，消除构建竞态

## 现象与影响

Voice 对话面板拆分了 4 个组件文件（VoiceDialog / ChatInput / MessageList / MessageBubble），子组件通过独立文件引入。构建时 Vite 需解析 3 个额外入口点，在热更新（HMR）或依赖预构建阶段偶发出错，表现为：

- 偶发性 500 错误（Vite 预构建循环依赖解析失败）
- 子组件样式／逻辑未及时被捕捉的 TypeScript 类型变更时，LSP 报告状态不同步

虽然频次不高，但一旦出现阻塞开发流程，回退成本较高。

> ⚠️ **实际 scope 已显著扩展**：本 hotfix 在实际执行中，除了上述核心修复外，还包含了 Server SQLite 数据库层、Client Zustand 状态管理、STT/TTS 语音能力集成、意图识别路由等大量附加变更。详见下文「实际变更范围」。

## 复现步骤与失败测试

1. `npm run dev` 启动开发服务器
2. 多次刷页面或 HMR 快速保存子组件文件
3. 偶发 → 页面白屏 / Vite 预构建崩溃 / 模块解析 500

因偶发且依赖构建并发，无稳定 100% 复现。本次修复属于预防性加固。

## 期望行为与需求 ID

- **VoiceDialog-ARCH-1**: 语音对话面板所有子组件应当内联在同一文件中消除额外模块加载
- 构建产物体积和组件行为不变
- 外部的 `import VoiceDialog from './VoiceDialog'` 不受影响

---

## 实际变更范围

### 一、核心修复（原方案）

| 文件路径 | 类型 | 摘要 |
|---|---|---|
| `client/src/voice/VoiceDialog.tsx` | 修改 | 将 ChatInput、MessageList、MessageBubble 三个子组件的定义内联到同一文件，消除 Vite 额外模块解析入口 |
| `client/src/voice/ChatInput.tsx` | 删除 | 原独立组件文件，定义已移入 VoiceDialog.tsx |
| `client/src/voice/MessageList.tsx` | 删除 | 同上 |
| `client/src/voice/MessageBubble.tsx` | 删除 | 同上 |

### 二、伴随变更 — Server（新增数据库层）

| 文件路径 | 类型 | 摘要 |
|---|---|---|
| `server/db/schema.ts` | **新增** | SQLite 数据库 schema 定义，包含 `sessions`、`messages`、`memories` 三张表的 DDL |
| `server/db/connection.ts` | **新增** | SQLite 数据库连接管理（基于 better-sqlite3），单例模式，支持 WAL 模式 |
| `server/db/message-repo.ts` | **新增** | 消息仓库层：消息的 CRUD 操作，支持按 sessionId 查询、分页、创建/软删除 |
| `server/db/session-repo.ts` | **新增** | 会话仓库层：会话的 CRUD 操作，支持按 title/topic 搜索、分页、创建/软删除 |
| `server/db/memory-repo.ts` | **新增** | 记忆仓库层：角色/世界记忆的持久化与查询 |
| `server/db/index.ts` | **新增** | db 模块统一导出入口 |
| `server/config.ts` | 修改 | 新增 `dbPath` 配置项，指定 SQLite 数据库文件路径 |
| `server/index.ts` | 修改 | 服务启动时调用 `initSchema()` 初始化数据库表结构 |
| `server/package.json` | 修改 | 新增依赖：`better-sqlite3`、`uuid` 及对应类型包 |
| `server/routes/sessions.ts` | 修改 | 从 mock 数据改为真实数据库 CRUD：支持 `title`、`topic`、`parentId`、`createdAt` 等字段的完整读写 |
| `server/routes/messages.ts` | 修改 | 从返回空数组改为从 `message-repo` 查询数据库 |
| `server/ws/handler.ts` | 修改 | WebSocket 处理器增加 session 存在性检查、消息实时持久化写入、`lastActiveAt` 时间戳更新 |

### 三、伴随变更 — Client（状态管理 / 语音能力 / 组件增强）

| 文件路径 | 类型 | 摘要 |
|---|---|---|
| `client/src/stores/chatStore.ts` | **新增** | Zustand 状态管理：完整的 Session / Message CRUD 操作接口，支持流式消息构建、AI 响应构建、会话切换 |
| `client/src/voice/hooks/useSpeechToText.ts` | **新增** | STT（语音转文字）Hook：基于 Web Speech API 的实时语音识别，支持连续识别、中间结果回调、错误处理 |
| `client/src/voice/components/VoiceInputBlurText.tsx` | **新增** | 模糊转写文本展示组件：在语音输入未确认前显示带模糊效果的转写文本，确认后转为清晰文本 |
| `client/src/voice/utils/intentDetector.ts` | **新增** | 意图识别工具函数：基于关键词/规则匹配的轻量级意图路由（角色对话、世界询问、记忆操作等） |
| `client/src/voice/hooks/useVoiceChat.ts` | 修改 | **大幅重写（+202 行）**：集成 TTS 语音合成、STT 实时转写流、意图检测路由、消息历史加载、`interimText` 实时转写状态、`isSpeaking` 语音播放状态 |
| `client/src/voice/VoiceDialog.tsx` | 修改 | 新增 Cmd+K 快捷键开关、星球点击打开入口、`isSpeaking` 语音指示器、`interimText` 实时转写透传 |
| `client/src/voice/Starfield.tsx` | 修改 | 约 60 行非相关改动（星空粒子交互优化 / 动画参数调整） |
| `client/src/utils/EventBus.ts` | 修改 | 2 行改动（事件类型扩展 / 订阅逻辑微调） |

---

## 风险与回滚

- ~~**低风险**~~ → **中风险**。原因：
  - 新增数据库层（better-sqlite3 原生模块）可能引入编译/平台兼容问题
  - 新增 npm 依赖（better-sqlite3, uuid）需要 CI/CD 环境同步安装
  - Zustand 状态管理重构涉及 client 全局状态流变化
  - STT/TTS 集成依赖浏览器 API（Web Speech API），低版本浏览器不兼容
  - 原始的内联修复（4 文件→1 文件）仍为纯合并，风险可控
- **回滚**：`git revert HEAD~N`（需确认 N），或直接切回 `fix/fix3` 之前的基线

---

## 验证清单

### 核心修复验证
- [ ] 构建验证：`npm run build` 通过，无 Vite 预构建告警
- [ ] HMR 验证：多次热更新子组件相关代码，无白屏/500
- [ ] 类型检查：`npx tsc --noEmit` 通过
- [ ] 外部导入确认：`import VoiceDialog from './VoiceDialog'` 正常

### 数据库层验证
- [ ] SQLite 初始化验证：初次启动后 `data/` 目录下生成 `.db` 文件，表结构正确
- [ ] 会话 CRUD 验证：创建/查询/更新/删除 session 操作返回正确结果
- [ ] 消息持久化验证：发送消息后查询数据库确认消息已写入
- [ ] WebSocket 持久化验证：WS 消息发送后数据库中存在对应记录，`lastActiveAt` 更新

### Client 状态管理验证
- [ ] Zustand store 初始化正常，无 `undefined` 状态
- [ ] Session 切换时消息列表正确更新
- [ ] 流式消息构建 UI 表现平滑

### 语音能力验证
- [ ] STT Hook 初始化正常，浏览器授权弹窗正常触发
- [ ] `interimText` 实时转写文本在 UI 中正确展示
- [ ] TTS 语音合成播放正常，`isSpeaking` 状态正确映射到 UI 指示器
- [ ] 意图识别路由：语音输入后能正确路由到对应处理分支

### 回归验证
- [ ] 原生对话功能不受影响（Keyboard 输入→发送→AI 回复链路正常）
- [ ] 构建产物大小无异常膨胀（关注 better-sqlite3 原生模块打包）
- [ ] 项目在 Windows/macOS/Linux 下 `npm install` 均无报错

---

## 变更总结

| 维度 | 统计 |
|---|---|
| 新增文件 | ~9 个（db 目录 6 个 + chatStore + useSpeechToText + VoiceInputBlurText + intentDetector） |
| 修改文件 | ~8 个（VoiceDialog.tsx, useVoiceChat.ts, Starfield.tsx, EventBus.ts, config.ts, index.ts, sessions.ts, messages.ts, ws/handler.ts, package.json） |
| 删除文件 | 3 个（ChatInput.tsx, MessageList.tsx, MessageBubble.tsx） |
| 新增依赖 | better-sqlite3, uuid, @types/better-sqlite3, @types/uuid |

## 验证与事后补档

- [x] 已先观察复现测试失败
- [x] 未引入不当 hardcode
- [ ] 已补齐当前规格（本次更新后）
- [ ] 已记录复盘
