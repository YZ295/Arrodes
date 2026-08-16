# 实施计划：seminar-context

1. `seminarService`：
   - 常量 `SEMINAR_SUMMARY_THRESHOLD`（环境变量可覆盖）
   - `buildSeminarPrompt` 增加 `phaseSummary` 字段，历史段 = 摘要 + 最近一轮原文
   - `runSeminar` 每轮结束后按阈值生成/更新滚动摘要
   - 摘要调用 `llm.summarizeText`（thinkingDisabled，maxTokens 300）
2. 测试 RED→GREEN（短历史不变 / 长历史触发 / 落库全量）
3. tsc + build + 全量测试
4. 端到端冒烟（4 人 2 轮），spec 归档，提交
