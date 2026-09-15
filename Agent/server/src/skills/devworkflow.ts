/**
 * 开发工作流技能族（devworkflow）
 *
 * 将 WorkBuddy 的 6 个核心 skill 集成进 Arrodes 技能系统：
 *   grill-me              → 深度追问方案，达成架构共识
 *   to-spec               → 无代码业务规范（Plan/business-spec.md）
 *   to-tickets            → 按功能拆任务（Plan/tickets.md）
 *   implement             → TDD 实现（红-绿-重构，防作弊）
 *   code-review           → 系统化代码审查（Plan/code-review.md）
 *   improve-architecture  → 架构优化路径（Plan/architecture-improve.md）
 *
 * 调用方式：LLM 在对话中通过 <tool_call> 按需调用（见 registry.ts 协议），
 * 执行后返回精炼执行协议，由 LLM 据此完成整个工作流。
 */
import { registerSkill } from './registry.js';

const PROTOCOL_TAG = '请严格按以下工作流执行，产出物必须落盘到 Plan/ 目录，完成后汇报关键结果与文件路径。';

registerSkill({
  name: 'grill-me',
  description:
    '深度追问式方案审查：逐层拆解设计决策直到达成共识。用户说"grill me""帮我审一下方案""压力测试这个计划/设计"或方案实施前需要暴露隐藏假设时调用。',
  args: [
    { name: 'topic', type: 'string', required: false, description: '待审查的方案/设计主题，缺省则从对话上下文推断' },
  ],
  execute: async () => `【grill-me · 深度追问方案】
${PROTOCOL_TAG}
1. 逐层追问用户方案：每个问题先给出你的推荐答案再提问，等用户回答后再进入下一个
2. 沿设计决策树逐分支走完，先解决依赖性问题，分支内按依赖顺序解决子决策
3. 能用 Read/Grep 查代码回答的问题不要问用户
4. 直到所有分支解决、无"取决于…"的悬而未决项为止
5. 结束：用一段话总结关键决策
注意：这是纯对话式审查，不读文档不产出文件；若项目已有 CONTEXT.md/领域模型，改走 to-spec 对齐术语。`,
});

registerSkill({
  name: 'to-spec',
  description:
    '将需求/想法转化为无代码业务规范文档（写入 Plan/business-spec.md）。用户说"写规范""转成 spec""to-spec"或从讨论进入设计阶段时调用。与 implement、code-review 配套。',
  args: [
    { name: 'topic', type: 'string', required: false, description: '要规范化的需求主题，缺省则从对话上下文推断' },
  ],
  execute: async () => `【to-spec · 生成无代码业务规范】
${PROTOCOL_TAG}
1. 收集上下文：读项目现有文档（Plan/、README 等），若已有 code-review 结论以其为输入
2. 产出 Plan/business-spec.md，包含 6 章节：
   ① 产品定位（是什么/为谁/核心价值）
   ② 域模型（实体与关系，业务语言）
   ③ 关键流程（主流程/异常流程）
   ④ 业务规则（用"当…必须…"表述，可被测试）
   ⑤ 非功能需求
   ⑥ 边界与例外（明确"什么不做"、外部依赖、已知限制）
3. 写作规范：禁止出现代码/类型名/SQL/API 路径；用业务语言；保留 [待确认: 问题] 标记
4. 完成：展示文档路径 + 待确认问题清单，请用户逐条拍板`,
});

registerSkill({
  name: 'to-tickets',
  description:
    '将业务规范/需求拆解为可执行任务清单（写入 Plan/tickets.md）。用户说"拆任务""转成 tickets""to-tickets"或规范已定需要排期时调用。与 to-spec、implement 配套。',
  args: [
    { name: 'source', type: 'string', required: false, description: '输入来源：business-spec.md 路径或需求描述，缺省读 Plan/business-spec.md' },
  ],
  execute: async () => `【to-tickets · 任务拆解】
${PROTOCOL_TAG}
1. 输入：读 Plan/business-spec.md（不存在则先提示运行 to-spec）
2. 按功能域分组产出 Plan/tickets.md，每张 ticket 必须包含：
   ### T<编号>. <动词开头的一句话目标>
   - 里程碑（M0 清理/测试基建 / M1 架构修复 / M2 体验优化）
   - 改动点 / 验收标准（必须可机器验证，如"npm test 全绿"）
   - 依赖（被谁阻塞/阻塞谁）
3. 每张 ticket 足够小（半天~2 天），可独立测试
4. 结尾输出 ASCII 依赖图，标注可并行组；依赖无环
5. 完成：展示 tickets.md 路径 + 按里程碑的推荐执行顺序，询问是否开始 M0（转 implement）`,
});

registerSkill({
  name: 'implement',
  description:
    '用 TDD 实现功能（防作弊）：先写失败测试（红）→ 最小实现（绿）→ 重构。严禁先写代码再补测试。用户说"implement""实现""按 TDD 写""开始执行 tickets"时调用。',
  args: [
    { name: 'ticket', type: 'string', required: false, description: '要实现的 ticket 编号或描述，缺省从 Plan/tickets.md 取下一个' },
  ],
  execute: async () => `【implement · TDD 实现（防作弊铁律）】
${PROTOCOL_TAG}
铁律：① 先写失败测试并运行确认是"红的"（因预期原因失败）——不许跳过；② 再写最小实现让测试变绿；③ 重构后必须重跑测试仍绿；④ 每个循环提交一次 RED→GREEN→REFACTOR 证据；⑤ 没有测试的实现不算完成，禁止事后补测试
流程：
0. 读 ticket 验收标准；确认测试工具链（vitest 等），未装先给安装命令等用户确认
1. RED：写失败测试 → 运行展示失败输出
2. GREEN：只写让测试通过的最小代码，不写多余逻辑
3. REFACTOR：提取函数/消除 any/统一命名 → 重跑测试
循环直到 ticket 验收标准全部覆盖
测试纪律：数据库用内存库(:memory:)；外部依赖(LLM/网络)一律 mock；服务端核心服务优先
完成：汇报红了几次/绿了几次/重构了什么/剩余风险`,
});

registerSkill({
  name: 'code-review',
  description:
    '系统化代码审查：按严重度（P0/P1/P2）输出带证据的发现、正确性问题、风险与改进建议。用户说"review""审查代码""code-review"或功能实现完成后调用。与 implement、improve-architecture 配套。',
  args: [
    { name: 'target', type: 'string', required: false, description: '审查范围（文件/目录/功能），缺省则审查最近改动' },
  ],
  execute: async () => `【code-review · 系统化代码审查】
${PROTOCOL_TAG}
1. 审查维度（按序）：正确性（逻辑/边界/竞态）→ 安全（硬编码密钥/注入/越权）→ 可维护性（any 滥用/魔法数字/巨型函数>200行）→ 可测试性（无法注入/时序依赖）→ 架构一致性（是否违背既有 repo/管道模式）
2. 严重度：P0=数据丢失/崩溃/安全漏洞/不可用；P1=明显风险或技术债；P2=风格/可维护性
3. 纪律：每条发现必须有证据（文件路径+行号+代码摘录）；P0/P1 给具体修复建议；审查只读不改
4. 输出写入 Plan/code-review.md，并给出"必须修(P0)/建议修(P1)/可选(P2)"三清单
5. 完成：询问是否按 P0 优先开修（转 implement）`,
});

registerSkill({
  name: 'improve-architecture',
  description:
    '基于审查结果输出目标架构与优化路径（写入 Plan/architecture-improve.md）：现状-目标对比、关键决策、执行顺序、依赖权衡。用户说"优化架构""improve architecture""重构架构"或 code-review 之后调用。',
  args: [
    { name: 'source', type: 'string', required: false, description: '输入来源：code-review.md 或架构审查报告，缺省读 Plan/code-review.md' },
  ],
  execute: async () => `【improve-architecture · 架构优化】
${PROTOCOL_TAG}
1. 输入：Plan/code-review.md（无则先运行 code-review）
2. 输出 Plan/architecture-improve.md：
   ① 目标架构图：ASCII 分层图（client/server/数据层/外部依赖），标注本次要改动的连接
   ② 关键架构决策表：决策 | 现状 | 建议 | 理由 | 风险
   ③ 分阶段演进路径：按"风险消除"排序，先消除最脆弱耦合
   ④ 权衡说明：每个决策写清"放弃什么换什么"
3. 原则：演进而非重写；每个改动对应 ticket（引用编号）；无测试兜底的架构改动禁止
4. 完成：输出"下一个该执行的 ticket"建议，询问确认后转 implement 执行`,
});
