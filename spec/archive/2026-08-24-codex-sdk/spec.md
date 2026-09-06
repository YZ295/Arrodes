# 行为规格：codex-sdk

## ADDED Requirements

### REQ-CODEX_SDK-001：服务端必须新增 `@openai/codex-sdk` 依赖

服务端 `Arrodes/server/package.json` 必须新增 `@openai/codex-sdk` 依赖
（^0.149.1），且类型检查、构建、全量测试必须通过。

#### Scenario：安装依赖后类型检查通过

- **前置条件**：已在 server 目录 `npm install @openai/codex-sdk`
- **当**：运行 `npm --prefix Arrodes/server run typecheck`
- **则**：tsc --noEmit 零错误，`import { Codex } from '@openai/codex-sdk'` 可解析

### REQ-CODEX_SDK-002：`CodexSdkAdapter` 必须提供有状态多轮线程

`CodexSdkAdapter` 必须实现 `AgentChatAdapter`：同一 `sessionKey` 复用同一
codex Thread（连续对话），不同 sessionKey 相互隔离；未提供 sessionKey 时
走一次性会话（single-shot），不跨调用保存状态。

#### Scenario：同一会话两轮对话复用线程

- **前置条件**：adapter 已注册，`startThread` 返回可记录调用的 fake Thread
- **当**：先后 `run('你好', { sessionKey: 'ws1:codex' })`、
  `run('接着聊', { sessionKey: 'ws1:codex' })`
- **则**：两次调用落在同一个 Thread 实例上，且第二次不再新建线程

#### Scenario：不同会话隔离

- **前置条件**：同上
- **当**：用 `sessionKey: 'ws1:codex'` 与 `sessionKey: 'ws2:codex'` 各跑一轮
- **则**：创建两个不同的 Thread，互不复用

#### Scenario：无 sessionKey 一次性调用

- **前置条件**：同上
- **当**：`run('一次性任务', { cwd })`（无 sessionKey）
- **则**：每次调用新建 Thread，且调用后不保留该 Thread 供复用

### REQ-CODEX_SDK-003：权限必须映射到 sandbox 模式

`run` 的 `permission` 必须映射为 ThreadOptions.sandboxMode：
`default`→`workspace-write`、`full`→`danger-full-access`；未传时按 `default`
处理。线程必须设置 `workingDirectory=opts.cwd`、`skipGitRepoCheck=true`、
`approvalPolicy='never'`。

#### Scenario：默认权限写仅限项目目录

- **前置条件**：fake Thread 捕获 thread options
- **当**：`run('改文件', { cwd: 'E:/proj', permission: 'default' })`
- **则**：startThread 收到的 sandboxMode 为 `workspace-write`，
  workingDirectory 为 `E:/proj`，skipGitRepoCheck 为 true

#### Scenario：全部权限放行全盘

- **前置条件**：同上
- **当**：`run('随便改', { cwd: 'E:/proj', permission: 'full' })`
- **则**：sandboxMode 为 `danger-full-access`

### REQ-CODEX_SDK-004：中止与超时必须可终止回合

`run` 必须把 `opts.signal` 透传给 Thread 回合；默认超时（
`ARRODES_CODEX_TIMEOUT_MS`，缺省 8 分钟）到期后必须中止并报告
「超时」。同一 sessionKey 的并发调用必须串行（前一轮未结束则等待）。

#### Scenario：外部中止传递到回合

- **前置条件**：fake Thread.run 记录收到的 turn options
- **当**：`run('长任务', { sessionKey: 'k', signal })`，其中 signal 已 abort
- **则**：fake Thread.run 收到 `{ signal }`，返回被中止的错误信息

#### Scenario：超时中止

- **前置条件**：fake Thread.run 永不返回；`ARRODES_CODEX_TIMEOUT_MS=100`
- **当**：`run('卡住的任务', { sessionKey: 'k' })`
- **则**：约 100ms 后返回/抛出包含「超时」的消息

#### Scenario：同会话并发串行

- **前置条件**：fake Thread.run 可手动控制 resolve
- **当**：同一 sessionKey 并发发起两次 run
- **则**：第二次 run 等待第一次完成后才调用 Thread.run

### REQ-CODEX_SDK-005：chat/tasks 路由必须启用有状态路径

`POST /workspaces/:id/agents/:agentId/chat` 对 `stateful=true` 的 adapter
必须只发送「学习注入 + 最新消息」（不拼接 chatRepo 历史），并把
`sessionKey=workspaceId:agentId` 与 `permission` 传入 run；非 stateful
adapter 保持现有历史拼接行为。`POST /:agentId/tasks` 同样传 sessionKey。

#### Scenario：codex 对话不再拼接历史

- **前置条件**：工作区已有 12 条历史；adapter.stateful=true
- **当**：POST chat 发送「今天天气」
- **则**：adapter.run 收到的 task 不含历史对话原文，sessionKey 为
  `workspaceId:codex`，permission 来自工作区配置

#### Scenario：非 stateful adapter 行为不变

- **前置条件**：adapter.stateful=false（如 hermes）
- **当**：POST chat 发送消息
- **则**：task 仍为「学习注入 + 最近 12 条历史 + 最新消息」

### REQ-CODEX_SDK-006：注册表默认启用 SDK，CLI 保留为回退

`agentAdapters` 中 `codex` 默认必须注册 `CodexSdkAdapter`；环境变量
`ARRODES_CODEX_ADAPTER=cli` 时必须注册原 `CodexCliAdapter`。SDK 因缺少
codex 二进制启动失败时，必须回退到 `CodexCliAdapter` 并记录警告。

#### Scenario：env 切回 CLI

- **前置条件**：`ARRODES_CODEX_ADAPTER=cli`
- **当**：读取 agentAdapters.get('codex')
- **则**：实例为 `CodexCliAdapter`

#### Scenario：SDK 缺二进制自动回退

- **前置条件**：fake Codex 构造抛 ENOENT
- **当**：注册 codex adapter
- **则**：注册成功且为 `CodexCliAdapter`，并输出警告日志

### REQ-CODEX_SDK-007：模型与线程来源可配置

`CodexSdkAdapter` 必须支持环境变量 `ARRODES_CODEX_MODEL` 与
`ARRODES_CODEX_REASONING`（minimal/low/medium/high/xhigh/max/ultra），
存在时透传给 ThreadOptions；`threadSource` 固定为 `arrodes`。

#### Scenario：模型配置透传

- **前置条件**：`ARRODES_CODEX_MODEL=gpt-5.3-codex`、
  `ARRODES_CODEX_REASONING=high`
- **当**：`run('hi', { sessionKey: 'k' })`
- **则**：startThread 收到 model 与 modelReasoningEffort 对应值

### REQ-CODEX_SDK-008：codex 必须预装 metagpt 与 openbot 技能

`$CODEX_HOME/skills/metagpt/SKILL.md` 与 `$CODEX_HOME/skills/openbot/SKILL.md`
必须存在且含 `name`/`description` frontmatter：metagpt 安装自社区
`curiositech/windags-skills`（MetaGPT 多角色软件开发方法论）；openbot 为
按 CopilotKit/openbot 运行模型（先决策→再执行→后记录、deny-first、审计
轨迹）编写的技能。codex 桌面端与 SDK 线程共享同一 CODEX_HOME。

#### Scenario：技能文件存在且可被 codex 加载

- **前置条件**：`CODEX_HOME=E:\AI\Codex`（用户级持久）
- **当**：检查两个 SKILL.md
- **则**：均存在、frontmatter 含 name 与 description、正文含各自核心规则
  （metagpt：角色分工/结构化交接；openbot：决策/执行/记录与审计）

### REQ-CODEX_SDK-009：阿罗德斯技能注册表必须登记 metagpt/openbot

服务端 `GET /api/v1/skills` 必须包含 `metagpt` 与 `openbot` 两个技能（可
从输入栏 ＋菜单附加到消息，含对 codex 的对话）；其 `execute` 必须读取
`$CODEX_HOME/skills/<name>/SKILL.md` 并返回正文，文件缺失时返回内置的精简
协议文本（不抛错）。路径经 `CODEX_HOME` 环境变量解析，禁止硬编码绝对路径。

#### Scenario：技能列表可见且可执行

- **前置条件**：两个 SKILL.md 已安装
- **当**：GET /api/v1/skills；调用 executeToolCall('metagpt'/'openbot')
- **则**：列表含两项；执行结果包含 SKILL.md 正文关键内容（如
  「structured」「审计」），不因缺文件抛异常

#### Scenario：缺文件时返回降级协议

- **前置条件**：临时改 `CODEX_HOME` 指向空目录
- **当**：调用 executeToolCall('openbot')
- **则**：返回内置精简协议文本，且不含错误堆栈

## CHANGED Requirements

无（`AgentChatAdapter` 接口向后兼容扩展：`stateful?`、opts 增加
`sessionKey?` 与 `permission?`，既有适配器忽略新增字段）。

## REMOVED Requirements

无（`CodexCliAdapter` 保留为回退，不删除）。
