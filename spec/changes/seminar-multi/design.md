# 设计文档：seminar-multi

## 1. 数据模型

`workspace_seminars` 新增 `participants TEXT NOT NULL DEFAULT '[]'`（JSON 数组，如 `["codex","hermes","deepseekHarness"]`）。

- 新库：建表语句直接包含该列
- 老库：`ensureWorkspaceColumns` 幂等迁移加列（默认 `'[]'`）
- 兼容：`agent_a`/`agent_b` 保留；新记录取 participants 前两个写入；查询时 `participants` 为空则回退 `[agent_a, agent_b]`

## 2. 服务端 API

`POST /workspaces/:id/agents/seminars`

- 请求体支持 `agents: string[]`（2-5 个），兼容旧 `agentA`/`agentB`
- 校验：2 ≤ 人数 ≤ 5、全部接入、全部有适配器、无重复
- `rounds` 上限从 6 降到 3（多方上下文膨胀约束）
- 响应 `seminar` 含 `participants`

`GET /workspaces/:id/agents/seminars/:seminarId`

- 返回 `seminar`（含 participants）+ `messages`（speaker 为各 agent id）

## 3. 研讨会编排（seminarService）

- `RunSeminarInput.agentA/agentB` → `participants: string[]`
- 轮转：每轮按 participants 顺序每人发言一次；prompt 中列出全部其他参与者
- 提炼 prompt 追加第五段要求：`裁决：阿罗德斯作为中枢对分歧的倾向性结论`
- `parseLearnings` 增加 `arbitration` 字段，写入学习小结与共享记忆
- `sourceAgent` 保持 `seminar:<id1>-<id2>-<id3>...`（注入按 `includes(agentId)` 依然有效）

## 4. 前端（SeminarDialog）

- A/B 两个下拉 → 参与者 chips 多选（2-5 个）
- 配置区显示已选 chips，点击移除；不足 2 个时「开始研讨」禁用
- 消息流与学习小结展示逻辑不变（speaker 已按 agent id 标注）
