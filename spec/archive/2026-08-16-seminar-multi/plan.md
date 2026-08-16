# 实施计划：seminar-multi

1. schema：`workspace_seminars` 加 `participants` 列 + 幂等迁移
2. repo：`create` 接受 participants；`get/list` 回退逻辑
3. service：`runSeminar` 多方轮转；`buildSeminarPrompt` 支持多参与者；提炼加第五段「裁决」；`parseLearnings` 加 arbitration
4. 路由：创建接口接受 `agents[]`，校验 2-5 人
5. 前端：SeminarDialog 多选 chips
6. 测试 RED→GREEN，tsc + build + 全量测试
7. 端到端冒烟，spec 归档，提交
