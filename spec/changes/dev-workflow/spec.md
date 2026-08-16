# 行为规格：dev-workflow

## ADDED Requirements

### REQ-DEV_WORKFLOW-001：工作流实体

**必须**支持在工作区内创建工作流，含标题、项目目录、可选来源研讨会；
初始阶段为 `idea`，状态 `active`。

#### Scenario：创建工作流

- **前置条件**：工作区存在
- **当**：提交标题（可选 projectDir / sourceSeminarId）
- **则**：创建 workflow，stage=idea，并初始化 idea 步骤（status=pending）

### REQ-DEV_WORKFLOW-002：阶段推进

**必须**按固定顺序推进阶段：
idea → spec → tickets → implement → review → done；
推进时上一阶段标记 done，下一阶段进入 in_progress。

#### Scenario：推进到规格阶段

- **前置条件**：workflow 处于 idea
- **当**：调用 advance（可带当前阶段产出物路径）
- **则**：idea 步骤 done（登记产出物），spec 步骤 in_progress

### REQ-DEV_WORKFLOW-003：步骤登记

**必须**允许对任意步骤更新状态（pending/in_progress/done）、产出物路径与备注。

#### Scenario：登记规格文档

- **前置条件**：workflow 的 spec 步骤存在
- **当**：更新 spec 步骤为 done 并登记 `Plan/business-spec.md`
- **则**：步骤显示 done 与产出物路径

### REQ-DEV_WORKFLOW-004：查询与隔离

**必须**按工作区隔离：列表只返回本工作区 workflow；详情含全部步骤。

### REQ-DEV_WORKFLOW-005：研讨会转入

**必须**允许从研讨会详情创建 workflow（sourceSeminarId 关联），
工作流面板展示来源研讨会主题。
