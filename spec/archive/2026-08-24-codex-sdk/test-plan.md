# 测试计划：codex-sdk

## 需求—测试映射

| 需求 ID | 测试文件/用例 | 层级 | 预期 RED | 验收结果 |
|---|---|---|---|---|
| REQ-CODEX_SDK-001 | `codexSdkAdapter.test.ts`：依赖可解析（import Codex） | unit | 安装前 import 失败 | 通过 |
| REQ-CODEX_SDK-002 | `codexSdkAdapter.test.ts`：同 key 复用线程 / 异 key 隔离 / 无 key 一次性 | unit | 功能不存在报错 | 通过 |
| REQ-CODEX_SDK-003 | `codexSdkAdapter.test.ts`：default→workspace-write、full→danger-full-access、skipGitRepoCheck=true | unit | 同上 | 通过 |
| REQ-CODEX_SDK-004 | `codexSdkAdapter.test.ts`：signal 透传 / 超时中止 / 同 key 并发串行 | unit | 同上 | 通过 |
| REQ-CODEX_SDK-005 | `workspaceAgents.test.ts`：stateful 分支不发历史 / 非 stateful 行为不变 / tasks 传 sessionKey | integration | 路由未改时断言失败 | 通过 |
| REQ-CODEX_SDK-006 | `codexSdkAdapter.test.ts`：env=cli 注册 CLI / ENOENT 回退 warn | unit | 同上 | 通过 |
| REQ-CODEX_SDK-007 | `codexSdkAdapter.test.ts`：模型与推理档透传、threadSource=arrodes | unit | 同上 | 通过 |
| REQ-CODEX_SDK-008 | 外部产物检查：`E:/AI/Codex/skills/{metagpt,openbot}/SKILL.md` 存在且含 frontmatter | contract | 安装前不存在 | 通过 |
| REQ-CODEX_SDK-009 | `agentProtocols.test.ts`：GET /skills 含两项 / execute 返回正文 / 缺文件降级 | unit | 注册前列表缺项 | 通过 |

## 验证命令

- `npm --prefix Arrodes/server test`（vitest，全量含新增用例）
- `npm --prefix Arrodes/client test`（vitest）
- `npm --prefix Arrodes/server run typecheck`（tsc --noEmit）
- `npm --prefix Arrodes/client run build`（tsc -b + vite build）
- 手工冒烟：`POST /workspaces/:id/agents/codex/chat` 连续两轮，确认第二轮
  不再携带历史原文且 codex 记得上轮内容；`ARRODES_CODEX_ADAPTER=cli` 回退验证。
