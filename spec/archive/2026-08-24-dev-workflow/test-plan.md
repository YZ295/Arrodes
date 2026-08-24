# 测试计划：dev-workflow

| 用例 | 级别 | 验证点 |
|---|---|---|
| 创建工作流 | 单元（repo） | 初始 stage=idea，idea 步骤存在 |
| 按序推进 | 单元（repo） | idea→done、spec→in_progress；done 后拒绝推进 |
| 步骤登记 | 单元（repo） | 更新 status/artifactPath/notes 生效 |
| 隔离 | 单元（repo） | 不同工作区列表互不干扰 |
| 创建/列表/详情/推进 API | 路由级 | 状态码与响应结构 |
| 研讨会转入 | 端到端/手工 | SeminarDialog 创建带 sourceSeminarId 的 workflow |
