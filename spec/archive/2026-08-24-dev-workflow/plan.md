# 实施计划：dev-workflow

1. schema：两张新表（workspace_dev_workflows / workspace_dev_workflow_steps）
2. repo：`dev-workflow-repo.ts`（create/get/list/advance/updateStep + STAGES 常量）
3. 路由：`workspaceWorkflows.ts` 挂载到 workspaces.ts（创建/列表/详情/推进/步骤更新）
4. 前端：`DevWorkflowPanel` + 画布/工作区入口；`SeminarDialog` 加「转入开发工作流」
5. 测试 RED→GREEN（repo 单测 + 路由级冒烟）
6. tsc + build + 全量测试 + 端到端
7. spec 归档、提交
