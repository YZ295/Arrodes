# 技术设计：codex-sdk

## 当前状态

服务端为 ESM（`"type": "module"`）。`AgentChatAdapter` 目前只有
`run(task, { cwd, signal? })`；codex 走 `CodexCliAdapter`（`codex exec
--ephemeral` + 临时文件），hermes/dsh/workbuddy 各有独立适配器；注册表
`agentAdapters` 模块加载时注册 codex/hermes/deepseekHarness/workbuddy。
chat 路由把 chatRepo 最近 12 条历史 + 研讨会学习拼成 task 文本。工作区
`config.permission` 只有 `default` / `full` 两档。

## 方案与数据流

```
POST /workspaces/:id/agents/:agentId/chat
  → workspaceAgents.ts
      adapter.stateful ? (学习注入 + 最新消息) : (学习注入 + 历史 + 最新消息)
      adapter.run(task, { cwd, sessionKey: `${ws.id}:${agentId}`, permission })
  → CodexSdkAdapter.run
      key = sessionKey ?? `one-shot:${n}`
      busy[key] 存在则 await（串行）
      thread = threads.get(key) ?? codex.startThread({
          workingDirectory: cwd, skipGitRepoCheck: true,
          sandboxMode: mapPermission(permission),
          approvalPolicy: 'never', model?, modelReasoningEffort?,
          threadSource: 'arrodes',
        })
      turn = await thread.run(task, { signal })（超时竞速）
      busy[key] 清除；返回 turn.finalResponse
```

`CodexSdkAdapter` 内部维护 `Map<sessionKey, Thread>`（上限 64，超出淘汰
最早线程）+ `Map<sessionKey, Promise>`（busy 串行）。线程 ID 由 SDK 写入
`~/.codex/sessions`；本变更不做跨进程恢复（v1 内存态），进程重启后 codex
thread 仍可被 `resumeThread` 恢复，作为后续增强。

## 接口与兼容性

- `AgentChatAdapter` 增加可选只读属性 `stateful?: boolean`；`run` 的 opts
  增加可选 `sessionKey?: string`、`permission?: 'default' | 'full'`。
  既有适配器（hermes/dsh/workbuddy/CLI）不读取新字段，零改动。
- 新增 `CodexSdkAdapter`（`services/codexSdkAdapter.ts`），构造函数接受
  可选注入 `codex?: Codex`（测试用 fake）。
- 注册逻辑：默认 `new CodexSdkAdapter()`；`ARRODES_CODEX_ADAPTER=cli` 时
  注册 `CodexCliAdapter`；SDK 构造/首跑报 ENOENT 时回退 CLI 并 warn。
- chat 路由：`adapter.stateful ? buildStatefulPrompt(content, learnings) :
  buildHistoryPrompt(...)`；tasks 路由经 `dispatchAgentTask` 增加
  sessionKey/permission 透传。seminar 不传 sessionKey（其提示词自带
  transcript，避免线程内重复累积）。

## 配置、常量与依赖注入

<!-- 说明环境差异、业务策略和领域不变量如何提供，禁止不当 hardcode。 -->

- 常量（环境变量提供，禁止 hardcode）：
  - `ARRODES_CODEX_ADAPTER`：`sdk`（默认）| `cli`
  - `ARRODES_CODEX_TIMEOUT_MS`：回合超时，缺省 480000（8 分钟，与现 CLI 一致）
  - `ARRODES_CODEX_MODEL`：模型名，缺省不传（用 codex 自身配置）
  - `ARRODES_CODEX_REASONING`：minimal/low/medium/high/xhigh/max/ultra
  - 线程上限 64 条（`MAX_THREADS`，可被 env 覆盖）
- 依赖注入：`CodexSdkAdapter` 不直接构造全局单例；注册表传入 `new Codex()`
  实例或 factory，便于单测注入 fake；`@openai/codex-sdk` 的 `Codex` 类
  内部自行解析随包二进制（win32-x64 optional dep）。

## 备选方案与取舍

1. **继续 CLI + 历史拼接**：改动最小，但不解决状态/事件/权限痛点；否决。
2. **`codex exec --resume <session-id>`**：有状态但仍是文本/临时文件通道，
   无结构化事件与 sandbox 映射；否决。
3. **Rust crate（codex-rs）经 napi 绑定**：功能最强但构建链复杂、与 Node
   服务耦合高；否决。
4. **SDK + Arrodes harness 编排层并存（选中）**：保留既有多 agent 编排，
   仅替换 codex 底层执行通道；兼容性最好、风险最低。

## 失败模式、安全与回滚

- `turn.failed` / `error` 事件：把 `ThreadError.message` 包装返回，不抛裸
  异常（与现 CLI 适配器「透出诊断信息」一致）。
- spawn ENOENT（optional dep 未装）：回退 `CodexCliAdapter`，warn。
- 线程异常（如 session 损坏）：捕获后丢弃该 key 的线程，下轮重建。
- 安全：`approvalPolicy: 'never'` + sandbox 兜底；默认权限从「全权限」变为
  `workspace-write`（项目目录内写），full 才全盘——比现状更安全，属有意的
  行为差异，需用户知悉。中止由 `signal` 直达回合（SDK 原生 TurnOptions.signal）。
- 回滚：`ARRODES_CODEX_ADAPTER=cli` 立即回到旧通道；或整体还原依赖 + 注册代码。

## 数据迁移

`none`。如需要数据库结构或不可逆数据迁移，停止本 Skill 流程。
