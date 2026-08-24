# Codex SDK 接入（codex-sdk）

## 概述
用 OpenAI 开源的 `@openai/codex-sdk`（0.149.x）替换 codex 的 CLI 单轮通道，
使 codex 成为有状态、多轮、可选沙箱权限的一等 agent；同时预装
metagpt / openbot 两个协议技能。

## 适配器
- `CodexSdkAdapter`（`server/src/services/codexSdkAdapter.ts`）：
  - 同一 `sessionKey`（`workspaceId:agentId`）复用同一 codex Thread；
    无 sessionKey 走一次性会话；
  - 权限映射：`default`→`workspace-write`、`full`→`danger-full-access`；
  - `approvalPolicy='never'` + 沙箱兜底；`skipGitRepoCheck=true`；
    `threadSource='arrodes'`；模型/推理档可经
    `ARRODES_CODEX_MODEL` / `ARRODES_CODEX_REASONING` 配置；
  - 中止：调用方 signal + 回合超时（`ARRODES_CODEX_TIMEOUT_MS`，缺省 8 分钟）
    合并为 AbortSignal 直达回合；同 key 并发串行；
  - SDK 二进制缺失（ENOENT）时回退 `CodexCliAdapter` 并告警；
    `ARRODES_CODEX_ADAPTER=cli` 可强制旧通道。
- 路由：chat/tasks 对 stateful 适配器只发「学习注入 + 最新消息」，
  不再拼接历史；`dispatchAgentTask` 透传 sessionKey/permission。

## 技能（$CODEX_HOME/skills）
- `metagpt`：社区 SKILL.md（MetaGPT 多角色软件开发方法论：
  角色分工、结构化交接、执行反馈闭环、质量门槛）。
- `openbot`：按 CopilotKit/openbot 运行模型编写（先决策→再执行→后记录、
  deny-first、`.openbot/audit/` 审计日志）。
- 阿罗德斯技能注册表同步登记两项（输入栏 ＋菜单可见、可附加给 codex
  对话）；`execute` 读取对应 SKILL.md 正文，缺文件时返回内置精简协议。

## 依赖与配置
- 服务端新增依赖：`@openai/codex-sdk`（含平台二进制）、`zod`（显式化）。
- 运行前提：本地 codex 已登录或提供 `CODEX_API_KEY`；`CODEX_HOME` 指向
  含技能的 skills 目录。

## 边界与安全
- SDK 非交互管道不支持逐项确认：默认权限真正沙箱在项目目录内，
  full 才全盘——比旧 CLI 适配器（默认全权限）更安全，属有意行为差异。
- 线程会话落在 `~/.codex/sessions`；本版本进程内复用，跨进程恢复留待
  后续（`resumeThread` 已具备能力）。
