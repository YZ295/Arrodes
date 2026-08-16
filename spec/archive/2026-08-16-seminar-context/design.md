# 设计文档：seminar-context

## 1. 滚动摘要机制

`runSeminar` 维护 `phaseSummary: string`（阶段摘要）：

- 每轮结束后，若「全部历史文本长度 > 阈值（`SEMINAR_SUMMARY_THRESHOLD = 3000`）」，
  用 `llm.summarizeText`（thinkingDisabled，maxTokens 300）把「除最近一轮外的历史」
  压缩为 1-2 句关键观点，替换 `phaseSummary`。
- 下一轮 `buildSeminarPrompt` 的历史段 = `早期对话摘要`（phaseSummary）+ `最近一轮原文`。
- 摘要提示词：只保留影响后续讨论的关键观点/分歧/结论，不记录客套。

## 2. 与消息落库解耦

- `transcript` 数组始终全量累积，`repo.appendMessage` 照常写入全文。
- 仅 `buildSeminarPrompt` 的入参历史做滚动处理；`summarizeSeminar` 提炼时用全量 transcript。

## 3. 配置

- 阈值用命名常量（`SEMINAR_SUMMARY_THRESHOLD`，默认 3000），可被环境变量
  `SEMINAR_SUMMARY_THRESHOLD` 覆盖（不硬编码）。
