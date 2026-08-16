# 测试计划：seminar-context

| 用例 | 级别 | 验证点 |
|---|---|---|
| 短历史保持完整 | 单元（service） | < 阈值时 prompt 含全部发言、无摘要段 |
| 长历史触发摘要 | 单元（service） | > 阈值时 prompt 含「早期对话摘要」+ 最近一轮原文 |
| 摘要调用参数 | 单元（service） | 摘要用 thinkingDisabled + 有限 maxTokens |
| 落库全量 | 单元（service） | 摘要发生后 messages 仍为全部发言，提炼基于全量 |
| 端到端冒烟 | 手工 | 4 人 2 轮真实研讨会 done，无截断丢上下文 |
