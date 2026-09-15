# Agent/Plan/ — 规划稿目录（已归档）

> 归档日期：2026-09-13

## 状态

本目录下的历史规划稿已全部移入 `_archive/`。

**归档原因**：这些文档写于 2026-07-23 ~ 2026-08-09，其设计前提与现行架构冲突——尤其把 **Hermes 当作记忆层**：

- `P0/SS-SRV_后端服务_v1.0.md` — 整节「与 Hermes 的集成」，设计 `HermesClient`
- `P3/阿罗德斯_数据库ER图_v1.0.md` — 记忆节点表的 `hermes_id` 字段
- `P1/SS-MEM_记忆反馈系统_v1.0.md` — 明确写"记忆存储逻辑（Hermes 负责）"
- `P0/SS-VOX`、`P0/贾维斯_语音对话系统`、`Now0/Now4/Now5/Now7/Now8/Now9/Now13/Now15/Now16/Now17` 等

Hermes 已于 2026-09-13 从项目中彻底移除。记忆架构改为三层：**SQLite 运行状态 + Obsidian 长期记忆权威 + `workspace_memories` 候选队列**。

## 现行来源（实现新功能请只看这些）

| 想知道什么 | 看哪里 |
|---|---|
| 业务规范（系统应当做什么） | `spec/`（`workspace.md`、`decisions.md`） |
| 架构定调与长期决策 | `.workbuddy/memory/MEMORY.md` |
| 近期工作与决策过程 | `.workbuddy/memory/2026-*.md` |
| 当前迭代任务 | 仓库根 `Plan/tickets.md` |
| 记忆读写唯一入口 | `server/src/services/memoryService.ts` |

## 归档内容（49 个文件）

- `_archive/P0/ P1/ P2/ P3/` — v1.0「会话星球宇宙」设计稿 16 篇（前端 / 宇宙引擎 / 后端 / 记忆 / 意图 / 导航 / 主题 / 性能 等）
- `_archive/Now/` — Now0 ~ Now17 迭代记录
- `_archive/Fix/` — 构建修复与基线审批
- `_archive/` 根级 — `阿罗德斯_项目总纲_v1.0.md`、`master-plan.md`、`master-plan-v2.md`、`business-spec.md`、`tickets.md`、`tdd-plan.md`、`code-review.md`、`architecture-review.md`、`architecture-improve.md`、`bailongma-借鉴分析.md`

> **归档 = 不再作为设计依据，但保留设计演进史。** 可直接查阅，请勿据此实现新功能。
