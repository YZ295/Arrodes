# 变更提案：workspace-v2（多智能体协作工作区）

> 前置：workspace 阶段 1 骨架（连接器 + 共享记忆 Hub）已上线（feature/workspace）。
> 调研依据：Now17_多智能体工作区开源调研.md（agentboard 权限分级 / Dim0 OT+LWW / JarvisHub 画布即状态）。
> 执行方式：独立分支 `feature/workspace-v2`，开发验证后再并入主线（对齐 backup-restore 流程）。

## 背景与目标

Arrodes 侧边栏已有「工作区」面板（Agent 连接器卡片 + 共享记忆），但**没有工作区实体**：会话/记忆全局混杂、无切换、无任务协作、无重叠控制。

本提案将「工作区」从占位升级为**隔离的协作容器**：
1. **多工作区**：创建/切换/归档，数据按 `workspace_id` 隔离（会话/记忆/任务/进度）
2. **共享进度板（黑板）**：任务 + 进度 + 记忆 三类共享对象，多 agent 通过黑板协作，不直接对话
3. **多智能体协作**：Hermes 与 Arrodes 可认领任务（分工），或拆分子任务并行互补（同任务协作）
4. **重叠检测**：任务级（认领 CAS 拦截 + 标题相似预检）+ 文件级（写路径时间窗检测）；内容级（embedding）留 v2
5. **三级介入**：低风险自动执行 / 中风险确认后执行 / 高风险人工审批（对齐 agentboard 权限设计）

## 范围（Phase B）

- server：`workspaces` / `workspace_members` / `workspace_tasks` / `workspace_progress` 四张新表 + 存量表加 `workspace_id`（含迁移）
- server：workspace CRUD + 任务/进度/认领 API + WS 事件通道（`workspace:{id}`）+ 任务级重叠检测
- server：computer skill 写操作记录 `{path, hash, agentId, ts}`（文件级重叠检测数据源）
- client：工作区切换器（顶部下拉）+ 工作区面板升级（任务板/记忆/成员三视图）+ 介入确认弹层
- 迁移：现有 sessions/memories 归入「默认工作区」，无损

## 安全与并发设计

- 任务认领用 **CAS 原子操作**：`UPDATE workspace_tasks SET status='claimed', assignee=:a, version=version+1 WHERE id=:id AND status='pending' AND version=:v`，影响行数=1 才成功
- 进度/任务更新带 `version`（乐观锁），冲突返回 409 + 最新值，客户端展示 diff 提示（Dim0 typed-op 轻量版）
- 所有 workspace API 先校验 `workspace_id` 存在；角色模型（owner/admin/member/guest）在成员表预留，本地单用户阶段 owner 全权
- agent 文件写操作记 `prev_hash`，覆盖前校验冲突

## 不做（Phase C/D）

- 画布拖拽视图（appRegistry + 节点连线）——Phase C
- 内容级重叠检测（embedding 相似度）——Phase D
- 真多用户（多人同时在线）——Phase D
- 权限强制（角色仅存储校验基础，不做细粒度授权）——本地单用户阶段

## 验证

- 双端 tsc 零错误 + vite build
- 迁移：升级后旧会话/记忆仍在「默认工作区」
- 隔离：工作区 A 的数据不出现在 B 的查询结果
- CAS：两 agent 并发认领同一任务，仅一个成功
- WS：任务/进度变更广播到前端实时可见
- 重叠：同路径双写触发文件级告警
