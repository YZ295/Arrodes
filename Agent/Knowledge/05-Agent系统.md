---
title: 05-Agent系统
tags: [arrodes, agent, harness, routing]
created: 2026-08-09
---

# 05 · Agent 系统

## Harness（harness/harness.ts）

- `register(agent)`：注册 Agent（id / name / description / run）
- `route(content)`：**意图路由**——按关键词规则分发（v1 规则版，可升级 LLM 路由）
- `execute(agentId, ctx, ...)`：执行 Agent，支持取消（AbortController）
- 开关：环境变量 `HARNESS_ROUTING=off` 一键关路由（全走 main，可回滚）

## 路由规则

| 触发 | 路由到 |
|------|--------|
| 开发意图：grill-me / to-spec / to-tickets / implement / code-review / improve-architecture 等触发词 | **dev** |
| 记忆管理意图 | **memory** |
| 其余（默认兜底） | **main** |
| 显式指令（记住X/忘了X） | **WS handler 直接拦截，不进 harness** |

## 三个 Agent

| Agent | 人设 | 能力 |
|-------|------|------|
| **main** | 主对话（阿罗德斯人设：四戒/说话方式） | 完整技能列表 + 记忆上下文 + prompt 外壳 |
| **memory** | 记忆管家 | 对话后提取记忆/画像，后台调度 |
| **dev** | 开发工程师 | devworkflow 技能族 + 技能 Agent Loop（≤3 轮） |

## 执行流程

```
WS message
  → handler：显式指令拦截？（是 → 秒回）
  → harness.route(content) → agentId
  → harness.execute(agentId, ctx)
       → Agent.run() → LLM 流式回复（chunk 推送）
       → 技能调用循环（LLM 决定调工具 → executeToolCall → 回填）
       → 对话结束 → memory Agent 后台提取记忆
```

## Prompt 分层（Prime Agent 借鉴，阶段 4）

- **不可变核心**：`SYSTEM_PROMPT`（人设/四戒）代码内置，永不重写
- **可精炼外壳**：`services/promptShell.ts` + `data/prompt-shell/shell.json`
  - 追加/删除条目 → 版本递增 + 快照
  - `rollbackPromptShell(version)` 回滚
  - `mergeWithPromptShell()` 合并注入所有 LLM 调用
  - API：`GET/POST/DELETE/rollback /api/v1/prompt-shell`
- 测试隔离：`PROMPT_SHELL_FILE` 环境变量指向独立文件

## 路由测试（harness.test.ts，7 个）

- 普通对话 → main / 开发意图 → dev / 记忆意图 → memory / 显式指令不误判 / 开关关闭全走 main
