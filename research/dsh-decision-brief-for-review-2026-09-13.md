# 决策简报：DSH 是否应成为阿罗德斯的运行宿主

> 面向外部技术评审（Codex）的独立文档。
> 生成时间：2026-09-13
> 说明：本文自包含。评审者无需访问任何外部链接或原始会话。
> **第 8 节是我希望你重点回答的问题。第 5 节是我的判断，很可能是错的，请直接反驳。**

---

## 0. 三十秒版本

一个个人桌面 AI 管家项目（阿罗德斯 / Arrodes）目前由三块独立开发的东西组成，后期还要合并。项目作者想改用 **DeepSeek Harness（DSH）**——一个"一切皆插件"的开源 agent harness——作为**统一宿主**，把这三块装进去，理由是便于管理和后续迭代。

核心争议：这样做出来的东西，**还算不算作者自己的项目**？

我的中间结论是：取决于**谁在跑那个"心跳"（主循环）**。如果 DSH 的循环在跑，作者只是在装配插件；如果作者自己的 30 秒主循环在跑、DSH 只当执行的手，那产品归作者。我建议走后者。

**命名口径（2026-09-13 作者确认，本文全文遵循）**：
- **管家** = 桌宠（用户看到的脸与人格）
- **控制台** = 与桌宠连接的后端
- **阿罗德斯** = 最初做的那个，后续作为连接「管家」与 DSH 的那一层

⚠️ 第 3 节转述原会话时，"管家"是**旧义**（≈ 整个 AI 助手）。请按上述新口径理解本文其余部分。

---

## 1. 背景

### 1.1 作者与约束（影响方案可行性，请一并考虑）

- 独立开发者，计算机专业在读；**自称对这类工程不熟**，不熟悉命令行，不愿每次手动开前端 + 后端
- 硬件：单台 Windows 笔记本，RTX 4060 Laptop 8GB；**C 盘紧张，新软件一律装 E 盘**
- 项目要用于毕设 / 竞赛展示，必须能回答"你的核心工作在哪里"
- 对隐私敏感，此前已因隐私与合规顾虑**排除云端 TTS 方案**，坚持本地优先
- 明确诉求：希望这个 agent **能自己改自己**（自我迭代），且**降低日常管理成本**

### 1.2 项目现状（已核实的事实）

- 仓库分为 `Agent/` 与 `Butler/` **两个独立副本**（端口分离：Agent 3002/12003，Butler 3003/12012/12013；数据与 appId 分离）。这是**临时技术债**——两者本来同属一个项目，因开发程度不同暂未合并，计划后期合并回 `Agent/`。
- 技术栈：Node / TypeScript + React + Python + Electron
- 已有的核心资产：
  - **30 秒主循环**（`Butler/server/src/services/mainloop.ts`）
  - **多智能体编排 Harness**（`harness/harness.ts`：Agent 注册表、意图路由、任务日志、`on`/`emit` 生命周期事件、返回 disposer）
  - **工具执行管线**（`skills/registry.ts`：`pre → execute → post`，含 `ToolPreHook`/`ToolPostHook`，注册返回 disposer）
  - **授权闸门**（`services/actionGate.ts`，作为默认 pre 钩子）
  - **长记忆**（`services/MemoryGateway.ts` + SQLite）
  - **本地视觉链路**（MAGEVL 视觉侧车，端口 12012）
  - **桌宠**（EmotionBall 小球，VRM 3D 为备选，独立于 server）
  - 30+ 技能（`skills/` 下：computer / files / command / memory / browser / desktop / weather / mcp / wallpaper / reminder / knowledge / selfModify / devworkflow 等）

### 1.3 一个关键背景：作者已经按 DSH 的原理改过自己的项目

`spec/deepseek-harness-integration.md`（日期 2026-08-14）记录了从 DSH 提炼五条第一性原理并**落地**的过程：

1. 一切皆插件 —— 没有特权核心
2. 能力即 seam —— Definition / Provider / Consumer 三角，换 Provider 即换整套行为
3. 事件即扩展点 —— `tools/pre-execute → execute → post-execute`
4. 注册即副作用 —— `register` 返回 disposer，卸载即回滚
5. 模型可见 ⟺ 已记录 —— 进入模型请求的内容都能从会话日志重建

已完成的落地项：工具管线 + pre/post 钩子、actionGate 抽离为默认 pre 钩子、Harness 的 `on`/`emit` 与 turn 生命周期事件、fs / subprocess / llm 三条 seam 的三角抽象、轻量版 skill profiles。

**这意味着：阿罗德斯已经是一个 mini-DSH 的同构实现。** 这对"要不要换成 DSH"的判断很关键。

---

## 2. 待决策的问题

> 阿罗德斯是否应该改用 DSH 作为运行宿主（宿主 = 提供进程、插件加载、生命周期、调度、工具执行、会话的底座），把现有各模块改写成插件挂上去？

---

## 3. 一条先前会话的主张（浓缩，供背景参考）

作者曾与另一个模型讨论此问题，对方的主张经历了三轮翻转：

| 轮次 | 主张 |
|---|---|
| 1 | 可以把 DSH 当"编码智能体"的底层，但 **DSH 是编码引擎，不是产品本身**；Butler Core（记忆 / 身份 / 任务理解 / 路由 / 权限 / 事件）才是产品核心 |
| 2 | 是的，管家指挥 DSH。**管家负责"做什么"，DSH 负责"怎么把代码任务做完"**；DSH ≈ 管家手下的程序员 |
| 3 | **改口**：更推荐让 **DSH 直接当管家的 Agent Runtime / 内核**，作者围绕它写 Screen / Memory / Context / PC 控制 / Voice 插件，桌宠作为独立前端。理由是这样能省掉自造 Agent Loop / Session / 工具系统 / 调度 / 权限等基础设施 |

对方的自陈收尾：

> 下一步真正值得设计的，已经不是"要不要用 DSH"，而是 **Butler Core 到底应该负责什么、DSH 应该负责什么、以及屏幕监控如何把上下文自动交给 Coding Agent**。

对方同时给出两条风险提示：
- DSH **截至 2026-09 仍是 Developer Preview**，官方明示会有破坏兼容的变更
- 官方安全说明明确 **not production-ready**，且 **不能把 DSH 自带 Sandbox 当作唯一安全边界**

### 3.1 DSH 的客观事实（已拉取官方 README 核实）

- 仓库 `deepseek-ai/deepseek-harness`，**MIT License**，基于 **Cordis**（"一切皆插件"）
- 两个运行路径：
  - `npx @deepseek-ai/dsh web` —— 默认起 **Web UI 于 `http://127.0.0.1:3080`**
  - 从源码：`git clone … && pnpm install && pnpm run build && pnpm dsh web`
- 官方文档站 `https://deepseek-harness.github.io/deepseek-harness/`，仓库内含 `docs/architecture.md`、`docs/development.md`
- 提供 Creator Mode 自定义 Agent preset；社区有 `dsh-plugin` 主题的插件目录
- README 明确警告：**THERE WILL BE COMPATIBILITY-BREAKING CHANGES**

---

## 4. 代码取证：五条事实

### 4.1 项目已是 mini-DSH（见 1.3）

### 4.2 「操作电脑能力弱」的直接病因是**自己的黑名单**，不是能力不足

`services/computerService.ts` 提供的电脑操控总共只有 4 个原语：`exec_command` / `read_text_file` / `write_text_file` / `list_directory`。

而卸载软件所需的命令几乎全部命中 `BLOCKED_PATTERNS`：

| 卸载步骤 | 需要的命令 | 状态 |
|---|---|---|
| 跑官方卸载器 | `winget uninstall` / `uninstall.exe` | 可执行 |
| 删残留目录 | `rmdir /s`、`del /s`、`del /f` | **被拦截** |
| 删注册表项 | `reg delete` | **被拦截** |
| 删 / 停服务 | `sc delete`、`net stop` | **被拦截** |
| 强杀残留进程 | `taskkill /f /im` | **被拦截** |

源码注释原文：「危险命令黑名单拦截（**宁可多拦，不可漏网**）」。

作者的实际体验是"让它删除个软件都没删全"。**这是设计意图导致的，不是模型能力问题。**

### 4.3 「自我修改」功能已存在，缺的是安全网

`skills/selfModify.ts` 已注册 `self_modify` 技能，把改动任务委派给**本机 codex CLI**：

```sh
codex exec --ephemeral -C "${repoRoot}" -s ${sandbox} --color never -o "${outFile}" - < "${taskFile}"
```

缺口三个：
1. 沙箱默认 `danger-full-access`（注释说明：本机 Windows 沙箱起不来时兜底）
2. **没有 git 回滚** —— 改坏了无法一键撤销
3. **只返回文本摘要**，没有"改完还能不能启动"的验证

### 4.4 作者给出的四条换 DSH 的理由，逐条对账

| 理由 | 换 DSH 能解决吗 | 我判断的真实病因 |
|---|---|---|
| ① 每次要开前端还要开后端，命令不熟，桌面放 cmd 不好看 | **不能**（与架构无关） | 启动编排问题，一个静默启动脚本即可 |
| ② 换成 DSH 它就能自己改自己 | 部分（引擎已存在） | 已有 `self_modify`，缺回滚 + 验证 |
| ③ 连删个软件都删不干净 | **不能** | 见 4.2，自己的黑名单 |
| ④ 后续要能迭代，DSH 有插件市场 | **能** | 唯一真正指向 DSH 的一条 |

### 4.5 插件市场的双刃剑

- 收益：眼睛、记忆、PC 控制等大概率有现成插件，不必从零
- 风险：DSH 还在 0.1.x，插件同样在变；且**第三方插件是别人写的代码，运行在本机，持有文件 / 进程 / 网络权限**。对一个"本地优先 + 隐私敏感"的项目（曾因隐私合规砍掉云端 TTS）这是新增攻击面

---

## 5. 我的判断（请反驳）

### 5.1 归属判据：看谁在跑「心跳」

比"用户能看到什么"更硬的判据：**最后跑起来的那个循环是谁的。**

- 如果 **DSH 的 loop** 在跑，作者的插件只是器官 → 产出是一袋插件，别人装同样的插件会得到同样的东西
- 如果**作者自己的 30 秒主循环**在跑，DSH 只当执行的手 → 产品归作者

补充事实：DSH 是 everything-is-a-plugin，官方文档把 **Scheduling 也列为可替换插件**。因此"把自己的主循环作为调度插件装进去"理论上符合 DSH 的设计，不是 hack（**但这一点我没有实证，见第 8 节问题 2**）。

### 5.2 三个层级

| 层级 | 谁在跑心跳 | 产出 |
|---|---|---|
| ① 只加插件 | DSH 的 loop | 一袋插件 |
| ② **换掉心跳（我倾向）** | 作者自己的 30 秒主循环 | 作者自己的管家 |
| ③ 改宿主内核 | fork 的 Cordis | DSH 的一个分支 |

### 5.3 我认为成立的

- 作者"用插件化来吸收 Agent/Butler 合并债"的思路很聪明：**合并两套 Node 代码库很难，但"都变成插件"不需要合并**——插件边界天然是模块边界，"合并"退化为"决定保留哪些插件"
- 作者自述的判据"我加的眼睛/记忆/skill 都是我的，所以做出来的不是 DSH"**方向正确**，但需要一个前提：**这些必须长在作者自己的数据里**（自己的 SQLite / 文件），不能写进宿主的 storage 插件，否则宿主破坏兼容时会一起陪葬
- 追求"便于管理"必须落在**结构性收益**（一套宿主管住所有能力）而不是**少开几个窗口**（半小时脚本即可解决），否则将来会发现管理面没变小，只是从"开两个进程"变成"配插件、处理冲突、跟上游兼容"

### 5.4 我存疑的

- **"灵魂清单"是否真的能全部外置？** 如果灵魂的核心是"主动行为逻辑 + 路由决策"，那它与宿主的 loop 是同一层东西，就不是插件而是改宿主
- **层级②在工程上是否真的可行**，取决于 Cordis 的调度 seam 是否真能被外部实现替换（未实证）
- **对非专业开发者，"换宿主"是否反而增加了长期负担**——上游 breaking change 的成本会持续落在作者身上

---

## 6. 候选方案

| 方案 | 内容 | 优点 | 代价 |
|---|---|---|---|
| **A 只加插件** | 保持现有架构，把眼睛/记忆/技能作为 DSH 插件挂上 | 改动最小，立刻可用 | 产出是插件集，**答辩时难以回答"核心工作在哪"** |
| **B 换掉心跳（当前倾向）** | DSH 当宿主与执行层；**作者自己的 30 秒主循环作为调度插件**驱动；灵魂数据留在作者自己的库 | 归属清晰；吸收合并债；符合 DSH 设计 | 需先验证调度 seam 可替换；仍有上游漂移风险 |
| **C 改宿主内核** | fork DSH，改 Cordis | 控制力最强 | 维护成本最高；与上游长期分叉，**对非专业开发者不推荐** |
| **D 第四条路？** | 例如：不引入 DSH，自己把现有 mini-DSH 补完（含插件宿主与插件市场式加载） | 完全自主 | 重复造轮子；开发量大 |

---

## 7. 建议的最小可证伪实验

不做架构决策，先做一次两天量级的实验：

> **把「记忆」做成一个 DSH 插件挂上去，数据仍存放在作者自己的 SQLite。**

选记忆而非其他，因为它同时验证两件事：
1. **宿主挂得住**（插件能被加载、被调用、被卸载且回滚干净）
2. **灵魂能留在外面**（数据不在宿主手里）

成功 → 眼睛、路由、桌宠依次往上挂；失败 → 两天内知道方向不通。
（此前我建议过用 `get_active_window` 做首个插件，方向是错的——那验证的是"DSH 能否当编码智能体"，不是"DSH 能否当宿主"。）

---

## 8. 请评审者回答的问题

1. **判据是否成立？** "看谁在跑心跳"这个归属判据，是有效标准还是自我安慰式的措辞？如果你认为无效，替代判据是什么？
2. **层级②在工程上可行吗？** Cordis 的调度 / loop seam 是否真的可以被外部实现替换，从而让作者自己的 30 秒主循环驱动整个 DSH 宿主？还是说 loop 属于宿主内核对，无法从外部接管？请给出依据。
3. **顺序问题**：`Agent/` 与 `Butler/` 两套副本，应该"先合并成一套再考虑 DSH"，还是"都变成 DSH 插件来吸收合并"？哪个风险更低？
4. **自我修改的安全网**：`self_modify` 目前是 `danger-full-access` + 无回滚 + 无验证。请给出具体做法（建议包含：提交粒度、回滚机制、验证门槛、失败如何自动停止）。
5. **答辩风险**：如果走层级②，产出在毕设 / 竞赛场景下能否经得住"你的核心工作在哪里"的追问？还有哪些能强化归属感的工程动作？
6. **是否存在第四条路？** 有没有我漏掉的方案——例如不引入 DSH 而自建轻量插件宿主、或引入其他 harness（如 Codex / Claude Code 生态）？
7. **反向检查**：本文第 4 节的代码取证里，有没有被我误读的地方？尤其 4.2（黑名单导致卸载失败）和 4.4（四条理由对账）是否过度归因？

---

## 9. 名词表

| 名词 | 含义 |
|---|---|
| **管家** | **桌宠**（EmotionBall 小球 / VRM 备选）。用户看到的脸与人格。⚠️ 注意：本文第 3 节转述原会话时，"管家"是旧义（≈ 整个 AI 助手）；新口径下"管家"专指桌宠。请按新口径理解 |
| **控制台** | 与桌宠连接的后端（即现有 Butler server + client） |
| **阿罗德斯** | 最初做的那个（Agent 侧：agent 内核 / 主循环 / 技能 / 记忆），后续作为连接「管家」与 DSH 的那一层 |
| **DSH** | DeepSeek Harness，`deepseek-ai/deepseek-harness`，基于 Cordis 的开源 agent harness，MIT，Developer Preview |
| **Cordis** | DSH 所依赖的插件框架，设计理念为"时空可组合性" |
| **Harness** | 本文中既指 DSH，也指阿罗德斯自有的多智能体编排层（`harness/harness.ts`），注意区分 |
| **宿主 / 身体** | 提供进程、插件加载、生命周期、调度、工具执行、会话的底座 |
| **灵魂 / 心跳** | 作者的独有部分：长记忆、用户状态、人格提示词、路由决策、主动行为逻辑、桌宠形态、本地视觉链路。其中"心跳"特指那个持续驱动的循环 |
| **seam** | 可替换的能力接缝，由 Definition / Provider / Consumer 三角构成 |
| **self_modify** | 阿罗德斯已有技能，把改动任务委派给本机 codex CLI 执行 |

---

## 10. 相关文件索引（仓库内）

| 路径 | 内容 |
|---|---|
| `spec/deepseek-harness-integration.md` | 2026-08-14 从 DSH 提炼五条原理并落地的记录 |
| `Butler/server/src/services/mainloop.ts` | 30 秒主循环（"心跳"） |
| `Butler/server/src/harness/harness.ts` | 多智能体编排层（注册表 / 路由 / 事件） |
| `Butler/server/src/harness/agents/` | main / dev / memory 三个 agent 定义 |
| `Butler/server/src/skills/registry.ts` | 工具执行管线 `pre → execute → post` |
| `Butler/server/src/services/actionGate.ts` | 授权策略，默认 pre 钩子 |
| `Butler/server/src/services/computerService.ts` | 电脑操控 4 原语 + `BLOCKED_PATTERNS` 黑名单（见 4.2） |
| `Butler/server/src/skills/selfModify.ts` | `self_modify` 技能（见 4.3） |
| `Butler/server/src/services/MemoryGateway.ts`、`src/db/` | 长记忆与 SQLite 层 |
| `Butler/server/src/services/{fsProvider,commandProvider,llmProvider}.ts` | 三条 seam 的三角抽象 |
| `Butler/server/src/services/skillProfile.ts` | 轻量版 profiles / bundles |
| `research/dsh-butler-runtime-chat-2026-09-12.md` | 本决策的完整过程记录（含原始会话归档） |

---

## 附：一句话总结

作者想用 DSH 当宿主装自己的"灵魂"，方向可以成立；但**关键是别把自己的心跳（主循环）交出去**，并且**灵魂的数据必须留在自己的库里**。在投入架构改造之前，先用"把记忆做成插件"做一次两天的最小验证。
