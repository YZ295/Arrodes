# 设计文档：workspace-v2（多智能体协作工作区 · Phase B）

> 与 proposal.md 配套。本文档定义数据模型、API、事件协议与前端交互，作为实施依据。

---

## 1. 数据模型（SQLite，better-sqlite3）

### 1.1 新表

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'default',   -- default/dev/content
  icon        TEXT NOT NULL DEFAULT '🪐',
  config_json TEXT NOT NULL DEFAULT '{}',        -- { llm, skillWhitelist, connectors }
  status      TEXT NOT NULL DEFAULT 'active',    -- active/archived
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  member_type  TEXT NOT NULL,                    -- 'user' | 'agent'
  member_id    TEXT NOT NULL,                    -- 'local-user' | 'arrodes' | 'hermes' | ...
  role         TEXT NOT NULL DEFAULT 'member',   -- owner/admin/member/guest
  joined_at    TEXT NOT NULL,
  PRIMARY KEY (workspace_id, member_type, member_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_tasks (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  parent_id      TEXT,                           -- 子任务归属（并行互补拆解）
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',-- pending/claimed/running/done/failed/merged
  assignee_agent TEXT,                           -- 认领者：arrodes/hermes/...
  created_by     TEXT NOT NULL DEFAULT 'user',
  result         TEXT,                           -- 任务产出（TASK_RESULT payload）
  version        INTEGER NOT NULL DEFAULT 1,     -- 乐观锁
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_progress (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title        TEXT NOT NULL,                    -- 如「大创项目整体」
  value        REAL NOT NULL DEFAULT 0,          -- 0~100
  unit         TEXT NOT NULL DEFAULT '%',
  version      INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- 文件级重叠检测数据源（computer skill 写操作留痕）
CREATE TABLE IF NOT EXISTS file_ops (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  path         TEXT NOT NULL,
  action       TEXT NOT NULL,                    -- write/overwrite
  prev_hash    TEXT,
  hash         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_file_ops_path_ts ON file_ops(path, created_at);
```

### 1.2 存量表迁移

```sql
ALTER TABLE sessions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE memories ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_memories_workspace ON memories(workspace_id);
```

- 启动时 `initSchema()` 检查列存在性（`PRAGMA table_info`），缺失则 ALTER（幂等）
- 迁移同时创建「默认工作区」行，保证外键一致

## 2. API 设计（Express，前缀 /api/v1）

### 2.1 工作区 CRUD

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/workspaces` | 列表（含各工作区任务/进度概览） |
| POST | `/workspaces` | 创建 `{ name, kind, icon }`，自动加入 owner 成员 |
| GET | `/workspaces/:id` | 详情（config/成员/概览） |
| PATCH | `/workspaces/:id` | 改名/换图标/归档（status） |
| DELETE | `/workspaces/:id` | 仅归档（软删除），不物理删数据 |

### 2.2 任务与进度（黑板）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/workspaces/:id/tasks` | 创建任务（可带 `parentId` 拆子任务） |
| POST | `/workspaces/:id/tasks/:tid/claim` | **CAS 认领** `{ agent, version }` → 200 或 409 |
| PATCH | `/workspaces/:id/tasks/:tid` | 状态流转 `{ status, result, version }`（乐观锁） |
| GET | `/workspaces/:id/tasks` | 任务板列表（支持 ?status= / ?agent= 过滤） |
| GET | `/workspaces/:id/progress` | 进度板 |
| PUT | `/workspaces/:id/progress/:pid` | 更新进度 `{ value, version }`（乐观锁） |

### 2.3 重叠检测

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/workspaces/:id/overlap/check` | 提交 `{ title }` → 返回相似任务列表（任务级预检） |
| GET | `/workspaces/:id/overlap/files?window=60` | 时间窗内同 path 多 agent 写冲突列表 |

### 2.4 兼容保留

- `/workspaces/:id/memories`（GET/POST）迁移原共享记忆接口到工作区作用域
- 原 `/workspace`（单数）路由保留并重定向/返回默认工作区数据（向后兼容）

## 3. WS 事件协议（复用现有 /v1/chat，新增事件类型）

```json
{ "type": "ws:event", "event": "TASK_CREATED", "workspaceId": "ws-1",
  "payload": { "task": {...}, "prevVersion": 0 } }
```

| 事件 | 触发 | payload 要点 |
|---|---|---|
| TASK_CREATED / TASK_CLAIMED / TASK_UPDATED | 任务变更 | task + prevVersion（前端可 diff） |
| PROGRESS_UPDATED | 进度变更 | progress + prevValue |
| MEMORY_ADDED | 记忆写入 | memory 摘要 |
| FILE_CONFLICT | 文件双写检测 | { path, agents: [a,b], ts } |
| OVERLAP_SUGGESTED | 任务重叠建议 | { taskA, taskB, action: merge|split } |

- 前端仅监听当前激活工作区的事件，切换工作区即退订/订阅

## 4. 前端交互（client）

### 4.1 工作区切换器（工作区面板内部，经用户确认）
- **放在 WorkspacePanel 顶部**：工作区名 + 图标 + 下拉（切换/新建/归档）
- `localStorage['arrodes:active_workspace']` 持久化；切换后重新拉取会话列表/记忆/任务板
- 侧边栏入口不变（点「工作区」进面板）

### 4.2 工作区面板升级（WorkspacePanel 重构）
- **任务板视图**：任务卡片（状态/agent/进度）+ 认领/完成按钮 + 重叠建议条
- **记忆视图**：现有共享记忆列表（按工作区过滤）
- **成员视图**：人类 + 已接入 agent 列表（角色标识）

### 4.3 三级介入
- 自动：任务状态流转、进度数值更新 → 直接生效 + toast
- 确认：跨 agent 结果合并、覆盖文件 → 弹层「Arrodes 与 Hermes 都改了 X，如何合并？」（合并/采用其一/取消）
- 审批：agent 系统命令执行 → 复用 computer skill 现有命令拦截审批

## 5. 实施里程碑（隔离优先，经用户确认：先做隔离避免出 bug）

> 拆分策略：Phase B 分两个子阶段执行，B1 先隔离（本次），B2 协作（下一轮）。

### Phase B1 · 隔离（本次范围）
| 步骤 | 内容 | 验证 |
|---|---|---|
| M1 | schema + 迁移 + workspaces CRUD API | 迁移幂等；旧数据归默认工作区 |
| M2 | 前端切换器（面板内）+ 激活工作区 + **会话/记忆按工作区过滤** | 切工作区后数据隔离生效，无串味 |
| M3 | 存量接口兼容（sessions/memories 带 workspace 作用域） | 旧功能回归正常 |

### Phase B2 · 协作（下一轮）
| 步骤 | 内容 | 验证 |
|---|---|---|
| M4 | tasks/progress 表 + API + CAS 认领 | 并发认领仅一成功 |
| M5 | WS 事件通道 + 任务板视图 | 事件实时刷新 |
| M6 | 重叠检测（任务级 + 文件级）+ 三级介入 | 同路径双写告警；重叠建议弹层 |
| M7 | 全量验证（tsc/build/冒烟）+ 文档 | 提案验证清单全过 |

## 6. 风险与对策

| 风险 | 对策 |
|---|---|
| 存量数据迁移损坏 | 先备份（复用 backup API）再迁移；ALTER 幂等 |
| 事件风暴（高频 TASK/PROGRESS） | 前端 300ms 节流合并渲染 |
| agent 认领后崩溃卡死 running | 认领超时（10min）自动回滚 pending + 告警 |
| 与既有 feature/workspace 未提交工作冲突 | 独立分支开发，合并时先梳理 |
