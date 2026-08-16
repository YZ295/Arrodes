# 变更提案：dev-workflow

## 问题与背景

项目已有 devworkflow 技能族（grill-me / to-spec / to-tickets / implement / code-review /
improve-architecture），但只是「协议文本」——LLM 对话内执行，没有：

- 阶段状态机（不知道流程走到哪、下一步是什么）
- 产出物登记（spec/tickets/review 文档产出后没有统一追踪）
- 与多 Agent 研讨会联动（研讨会的架构共识无法一键转入开发流程）

## 目标

- 工作区级「开发工作流」实体：6 阶段状态机
  idea → spec → tickets → implement → review → done
- 每阶段可登记产出物路径与备注，全流程可追溯
- 研讨会一键转入：创建 workflow 并关联来源研讨会
- 前端时间线面板：查看阶段、推进、登记产出

## 非目标

- 改造 devworkflow 技能的协议内容（仍是 LLM 对话执行）
- 自动执行代码修改（implement 仍由阿罗德斯 LLM + 技能协议完成）
- 与 Codex wu5 门禁硬耦合（两个项目各自流程）

## 影响范围

- server：两张新表（workflow + steps）、仓库、路由
- client：DevWorkflowPanel + 研讨会「转入开发工作流」按钮

## 风险

- 阶段推进不校验产出物是否真实存在（登记由用户/LLM 负责，人工门禁）
- 不阻止跳阶段（advance 只按顺序推进，允许快速走过空阶段）

## 验收标准

- 创建 workflow（可关联研讨会）成功，初始阶段 idea
- 推进按阶段顺序走完 6 阶段，每阶段可登记产出物
- 列表/详情展示阶段与产出，按工作区隔离
- 研讨会面板可一键转入开发工作流
