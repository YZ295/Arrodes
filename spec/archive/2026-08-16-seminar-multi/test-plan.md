# 测试计划：seminar-multi

| 用例 | 级别 | 验证点 |
|---|---|---|
| 三方研讨会 1 轮 | 单元（service） | 3 个 agent 各发言 1 次，按序落库，第二轮携带历史 |
| 五人研讨会 | 单元（service） | 5 个 agent 轮转正常 |
| 人数越界 | 单元/路由 | <2 或 >5 拒绝 |
| 提炼含裁决段 | 单元（service） | mock LLM 输出含「裁决」时解析成功并写入记忆 |
| 旧记录回退 | 单元（repo） | participants 为空时返回 [agentA, agentB] |
| 兼容 agentA/agentB 请求 | 路由级 | 旧请求体仍可创建 |
| 端到端冒烟 | 手工 | 三方真实研讨会 done，四段+裁决落库 |
