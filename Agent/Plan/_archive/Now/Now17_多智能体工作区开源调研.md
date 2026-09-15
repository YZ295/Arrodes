# Now17_多智能体协作工作区开源调研.md

> 系统性检索 GitHub/Gitee 等多智能体协作、agent 画布相关开源项目，
> 深度分析架构与最佳实践，输出针对 Arrodes 工作区的优化方案。

---

## 1. 检索方法与候选清单

**关键词维度**：① 多智能体编排框架 ② agent 画布/工作区/白板 ③ 黑板模式协作 ④ 任务协调/重叠检测 ⑤ 节点式工作流

**候选项目全景**：

| 类别 | 项目 | 定位 | 关键特征 |
|---|---|---|---|
| 编排框架 | **CrewAI** (46K★) | 角色化团队协作 | Agent(Role/Goal/Backstory) + Task + Crew + Flows；入门首选 |
| | **LangGraph** | 图状态机工作流 | StateGraph + 条件边 + Checkpointer 状态持久化 |
| | **AutoGen** (微软) | 对话式多智能体 | GroupChat、人机协作、辩论投票 |
| | **MetaGPT** (30K★) | 软件团队模拟 | PM/架构师/工程师/QA 角色 + SOP 文档驱动 |
| | **Agno** | 高性能 Agent | 零开销抽象、多模态、内置 Memory/RAG |
| | **OWL (CAMEL)** | 研究型 Agent | GAIA 开源第一(69.09%)、MCP 原生支持 |
| | **PocketFlow** | 极简框架 | 核心仅 100 行：Node + Flow + 共享 Store |
| | **Shannon** | 生产级编排 | Temporal 工作流、预算控制、WASI 沙箱、OPA 策略 |
| 画布/白板 | **JarvisHub** (LYL1015) | 画布原生 Agent Harness | **画布=用户工作区+Agent外部记忆+行动空间+共享项目状态**（有论文） |
| | **agentboard** (AyingAI) | Agent 原生结构化白板 | **权限分级 + DSLPatch 校验拦截 + 低风险自动/高风险确认 + 撤销重做** |
| | **Dim0** | 开源协作 AI 画布 | Notes+mini-apps+agents 同板；**OT + LWW 并发**（Figma 同款）；多模型 |
| | **Kanwas** | 共享上下文白板 | 多 Agent 共享黑板中间存储层 |
| | **open-ai-canvas** | AI 创作画布工作台 | 节点连线、异步任务队列、失败重试、素材库 |

---

## 2. 编排框架层：核心结论

1. **黑板模式被证实有效**：arXiv:2510.01285 研究显示黑板模式可提升任务成功率 **13%~57%**、F1 提升 9% —— 直接验证了 Arrodes 工作区"共享黑板、不搞 agent 直连"的架构决策。
2. **三种编排哲学的取舍**（LangGraph vs CrewAI vs AutoGen）：
   - 任务确定性高 → CrewAI（角色模板，3 天上手）
   - 任务探索性强 → AutoGen（对话驱动，但 >15 步上下文膨胀、30 轮延迟 8.7s）
   - 长任务链动态路由 → LangGraph（状态机最灵活，但快照内存 2.3MB/实例，学习曲线陡）
3. **PocketFlow 的极简抽象**：Node + Flow + 共享 Store 仅 100 行，是"够用就好"的典范 —— 与 Arrodes 现有轻量 harness（注册表 + 任务日志 + 重试）理念一致，**不需要引入重型框架**。
4. **Shannon 的生产级要素**：任务 API（POST /api/v1/tasks）+ 沙箱 + 预算/成本追踪 + 确定性回放 —— 其中的"成本控制"与 Arrodes 已有 usage 表天然对接。

## 3. 画布/白板层：重点借鉴对象

### 3.1 agentboard —— 权限与介入的成熟设计（最值得抄）
- Agent 发送前**明确作用范围与权限**：整板 or 选中节点、是否允许改写/删除/全图布局
- **分级应用**：新增等低风险变更自动应用；删除/改写/全图布局等高风险变更**先展示提案、确认后落板**
- 结构化 **BoardDSL** 存储（非扁平图片）；Agent 输出经校验的 **DSLPatch** 应用，**超授权范围确定性拦截**
- 撤销/重做历史持久化；Agent 只读最近人类编辑增量（不必读全板）

### 3.2 Dim0 —— 实时协作并发方案
- **OT（操作变换）+ LWW（last-write-wins）**，与 Figma/Excalidraw 同款，非 CRDT
- 每个编辑 = 带 previous-value 的 typed op，服务端变换后广播；引擎 sync-agnostic（OT/CRDT 可插拔）
- 多模型切换（Claude/GPT/Gemini/DeepSeek/Qwen/Kimi/GLM）+ 隐私优先（本地 Postgres + 自托管）

### 3.3 JarvisHub —— 画布即一切（理念最契合）
- 把可编辑画布同时变成：**用户工作区 + Agent 外部记忆 + 行动空间 + 共享项目状态**
- Agent 直接"看"画布上的提示词/参考图/候选版本/依赖关系/失败记录/用户反馈，再规划行动
- 解决长程任务"项目状态丢失"痛点；有论文与完整 Harness 设计

### 3.4 Kanwas —— 黑板作为中间存储层
- 多 Agent 共享白板作为共享上下文存储，**减少 API 调用与上下文窗口限制**（Agent 不必重复携带全部历史）

---

## 4. 可借鉴最佳实践汇总（映射到 Arrodes）

| 来源 | 最佳实践 | Arrodes 落点 | 优先级 |
|---|---|---|---|
| agentboard | 权限分级 + 提案确认 + 越权拦截 | 工作区"三级介入"（自动/确认/审批）的具体实现范式 | P0 |
| agentboard | 结构化 DSL + 校验 Patch | workspace_tasks/记忆用结构化事件（{op,target,payload,prev}）而非裸写入 | P0 |
| Dim0 | OT + LWW typed ops | 共享进度冲突解决：每个变更带 previous-value，服务端变换 + 广播 | P1 |
| JarvisHub | 画布=共享状态+外部记忆 | 画布节点直接映射 workspace_tasks/assets/记忆，Agent 读写画布即读写状态 | P1 |
| LangGraph | Checkpointer 状态快照 | workspace_tasks 持久化 version + 状态快照，支持恢复/回滚 | P1 |
| Shannon | 预算/成本控制 + 沙箱 | agent 任务记录 token 消耗（复用 usage 表）+ computer skill 沙箱扩展 | P2 |
| CrewAI | 角色化定义 | 工作区成员带 Role/Goal/Backstory 元数据 | P2 |
| Kanwas | 黑板减上下文 | memory-hub 检索注入时只带相关片段（已有 MemoryGateway 检索） | P2 |
| PocketFlow | 极简抽象 | 不引入重型编排框架，harness 保持轻量 | 决策 |

## 5. 针对 Arrodes 工作区的优化方案

### Phase B（本次）落地建议（吸收调研结论）
1. **共享进度板 = 结构化黑板**：`workspace_tasks` 每条记录一个 `version` + `prev_value` 字段，所有变更走统一事件（`TASK_CREATED/CLAIMED/RESULT`），实现 agentboard 式"可校验 Patch"基础
2. **介入分级落实 agentboard 模式**：任务认领/进度更新（低风险）自动执行；跨 agent 结果合并/文件覆盖（高风险）先弹提案确认
3. **WS 事件通道带 previous-value**：前端收到冲突变更可提示"另一 agent 已修改"并展示 diff（Dim0 typed op 思想的轻量版）

### Phase C（画布）落地建议
4. **画布节点即对象**（JarvisHub 思想）：拖拽的 agent 卡片、任务卡片、记忆卡片共享同一状态层——操作画布 = 操作 workspace_tasks/assets/memory-hub，无需额外同步层
5. **文件级重叠检测用"路径 + prev"日志**：computer skill 写操作记录 {path, prevHash, agentId, ts}，时间窗内同 path 双写即报警（确定性强、可测试）

### 明确不做
- 不引入 LangGraph/CrewAI 等重型框架（harness 已够，避免架构膨胀）
- 不搞 agent 直连对话（黑板模式，已被研究数据支持）
- 内容级重叠（embedding）留 v2，先做任务级 + 文件级确定性检测

---

## 6. 调研结论

- **编排层**：行业共识是"没有银弹"，Arrodes 作为本地单用户 + 双 agent（Arrodes/Hermes）场景，**轻量 harness + 黑板**是正确规模
- **画布层**：agentboard 的权限分级、Dim0 的 OT/LWW、JarvisHub 的"画布即状态"三大实践，构成 Arrodes 工作区 Phase B/C 的**可直接落地的参考蓝图**
- 下一步：将本报告结论并入 `spec/changes/workspace-v2/proposal.md`，开 `feature/workspace-v2` 分支实施

---

*生成时间：2026-08-06 22:07 GMT+8 · 检索渠道：GitHub/Gitee/技术社区综合*