# 行为规格：seminar-multi

## ADDED Requirements

### REQ-SEMINAR_MULTI-001：多方研讨会

**必须**支持一个研讨会包含 2-5 个已接入且可对话的 agent。

#### Scenario：多方轮流发言

- **前置条件**：工作区已接入 codex/hermes/deepseekHarness 且均可对话
- **当**：用户发起研讨会并选择这三个 agent、主题、1 轮
- **则**：三个 agent 各发言一次，按顺序轮流，逐条保存并可查询

### REQ-SEMINAR_MULTI-002：分歧仲裁

**必须**在学习提炼时，若研讨记录存在分歧，输出「裁决」段（阿罗德斯作为中枢的倾向性结论）。

#### Scenario：分歧被仲裁

- **前置条件**：研讨会记录中存在两个及以上 agent 观点不同
- **当**：提炼学习小结
- **则**：小结包含「裁决」段，且学习沉淀写入共享记忆

### REQ-SEMINAR_MULTI-003：存量兼容

**必须**保证无 `participants` 列的旧记录（仅 agent_a/agent_b）仍可正常查询与展示。

#### Scenario：旧记录回退

- **前置条件**：数据库存在 T-07 创建的研讨会（仅 agent_a/agent_b）
- **当**：查询研讨会详情
- **则**：参与者列表回退为 [agent_a, agent_b]
