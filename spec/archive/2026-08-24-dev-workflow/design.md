# 设计文档：dev-workflow

## 1. 数据模型

```sql
CREATE TABLE IF NOT EXISTS workspace_dev_workflows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  project_dir TEXT NOT NULL DEFAULT '',
  source_seminar_id TEXT,
  stage TEXT NOT NULL DEFAULT 'idea'
    CHECK(stage IN ('idea','spec','tickets','implement','review','done')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_dev_workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','in_progress','done')),
  artifact_path TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

`STAGES = ['idea','spec','tickets','implement','review','done']`（命名常量）。

## 2. API

| 方法/路径 | 说明 |
|---|---|
| POST `/workspaces/:id/workflows` | 创建（title 必填；projectDir/sourceSeminarId 可选） |
| GET `/workspaces/:id/workflows` | 列表（按工作区隔离） |
| GET `/workspaces/:id/workflows/:wfId` | 详情（workflow + steps） |
| POST `/workspaces/:id/workflows/:wfId/advance` | 推进阶段（可选 artifactPath/notes 登记当前阶段产出） |
| POST `/workspaces/:id/workflows/:wfId/steps` | 更新步骤（stage/status/artifactPath/notes） |

advance 语义：当前 stage 步骤 → done（登记产出）；下一 stage 步骤 → in_progress；
已在 done 时拒绝。

## 3. 前端

- `DevWorkflowPanel`：阶段时间线（6 点），当前阶段高亮；每步骤显示状态/产出/备注；
  创建表单 + 推进/更新按钮
- `SeminarDialog` 学习小结区加「转入开发工作流」：POST 创建并携带 sourceSeminarId，
  成功后提示可打开工作流面板
