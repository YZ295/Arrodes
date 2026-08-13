# 架构决策：阿罗德斯增强（借鉴 Daisy-Voice-Agent × HoloJarvis）

- 状态：proposed（待用户逐条确认）
- 日期：2026-08-12
- 确认人：（待填）
- 关联变更：待启动（slug 候选 `voice-desktop-tools`）

## 背景与约束

用户请求：依据克隆的 [Daisy-Voice-Agent](https://github.com/YZ295/Daisy-Voice-Agent) 与 [holojarvis](https://github.com/YZ295/holojarvis) 完善阿罗德斯，包括但不限于操控电脑、语音交互、语音生成；同时借鉴 Obsidian 知识库（daily-briefing-2026-08-12、`06-参考项目借鉴.md`）。

现状基线（已核实）：
- Arrodes 已有：主循环 30s tick、多 Agent Harness（main/memory/dev）、33+ 技能、显式记忆指令、本地 CosyVoice2 TTS（懒启动侧车 :12001，含自定义音色克隆）、在线 STT（SiliconFlow SenseVoiceSmall）、workspace 连接器、TheFool 桌宠（PySide6）、Prompt Shell 分层、Token 额度、生产静态托管、Electron 壳。
- 数据库配置已核实正常：`DB_PATH` 绝对路径（`Arrodes/server/data`），`arrodes.db` 180KB 存在，WAL/SHM 正常，`prompt-shell/`、`tts/` 目录在库。`$HOME/.arrodes/.env` 与 `server/.env` 均为 `PORT=3002 / NODE_ENV=production`。

对照两项目的能力缺口：
| 缺口 | Daisy | HoloJarvis | Arrodes 现状 |
|---|---|---|---|
| 应用/窗口控制、键入、快捷键 | ✅（macOS Accessibility） | ✅ winops.py | ❌ 仅命令+文件列表 |
| 音量/媒体/锁屏 | ✅ | ✅ | ❌ |
| 剪贴板读写 | ✅ | ✅ | ❌ |
| 截图 OCR / 视觉理解 | ✅ | ❌ | ❌ |
| 浏览器操作 / 站内搜索直达 | ✅ 本地规则 | ❌ | ❌ |
| 唤醒词 / 一按即说 | ✅ whisper.cpp "嘿 Daisy" + 按住说话 | ✅ 拼音模糊唤醒 | ❌ 仅点击麦克风按钮 |
| 本地 STT | ❌（在线） | ✅ faster-whisper 不上传 | ❌ 仅在线 SiliconFlow |
| MCP 扩展 | ❌ | ✅ mcp_bridge | ❌ 自有技能注册表 |
| 全息 HUD / 系统遥测 | 悬浮球 | ✅ 3D 粒子 + 手势 | 仅 TheFool 状态色联动 |

硬约束：
1. wu5 变更门禁：同一仓库一次只能有一个活动变更。当前 `desktop-shell` 尚未归档、`spec/state.json` 验证记录为空；新变更只能在 desktop-shell 收尾后经 `wu5_flow.py new` 启动。
2. 工作区存在 Hermes 人物卡未提交文件（App.tsx、PanelView.tsx、MemoryPanel.tsx、EventBus.ts、llmService.ts、ProfilePanel.tsx、constants/behaviorGuidelines.ts）——归属用户/Hermes，本任务不触碰。
3. 借鉴原则（来自知识库 `06-参考项目借鉴.md`）：不照搬代码，按 Arrodes 特点适配；每条借鉴带验收标准；高风险项带开关/回滚。
4. 环境事实：Daisy 是 macOS 专用（Accessibility/AppleScript），其原生控制代码不能直接迁移到 Windows；HoloJarvis 是 Python 栈，其 winops 可参考但 Arrodes 后端是 Node/TS——借鉴模式而非代码。
5. 已知配置不一致（待用户裁决，不阻塞本轮决策）：`server/.env` 与 `$HOME/.arrodes/.env` 的 `DEEPSEEK_API_KEY` 不同；config.ts 先加载用户级（dotenv 不覆盖），因此生效的是用户级那把。repo 内 `.env` 已被 gitignore（`Arrodes/.gitignore:26`），不会入库。

## 开放决策 D1：范围与交付顺序

- 状态：proposed
- 问题：用户要求"全部改进"，但能力面横跨桌面操控、语音、浏览器、生态接入，单次大变更风险集中且中间态不可验收。

备选方案：
1. **A｜全部做，分 3 个里程碑，每里程碑独立验收**：M1 桌面操控（应用/窗口/键入/快捷键/音量/媒体/剪贴板/截图）→ M2 语音交互（唤醒词/一按即说/本地 STT 按 D2 定）→ M3 浏览器操作 + 站内搜索直达 +（可选）MCP 接入。每里程碑独立提交、独立测试证据、可随时回滚。
2. B｜全部做，单一大变更一次交付：周期长、回归面大、中间态不可用；与 wu5 的"一次一个变更"门禁冲突，需要巨型 plan。
3. C｜只先做 M1 桌面操控，其余进 backlog：最快见效，但语音/浏览器体验长期缺失，与"全部改进"意图不符。

推荐：**A**。理由：与 wu5 变更粒度匹配；M1 纯本地、无外部依赖风险，先行落地能最快形成"能干活"的闭环；M2/M3 依赖 M1 的权限模型与工具抽象，顺序合理。

## 开放决策 D2：语音识别（STT）策略

- 状态：proposed
- 问题：当前 STT 走在线 SiliconFlow（SenseVoiceSmall），语音内容上传第三方；Electron 壳内浏览器 `SpeechRecognition` 不可用；HoloJarvis 证明本地 faster-whisper 可行。本地化程度直接决定隐私、成本、首包体积与维护负担。

备选方案：
1. **A｜完全本地**：faster-whisper（Python 侧车，复用 tts-sidecar 的进程模式）嵌入；语音不出本机。代价：模型约 100–500MB（可放用户目录按需下载）、首载延迟、CPU 占用、需维护第二套 Python 依赖。
2. **B｜保持在线 + 本地唤醒词**：whisper.cpp 只做"嘿阿罗德斯"检测，识别仍走 SiliconFlow。代价最小、交互闭环最快；但语音内容仍上传。
3. **C｜混合（推荐）**：本地唤醒词 + 在线识别为默认，设置项可一键切全本地（A）；把隐私选择权交给用户，渐进迁移。

推荐：**C**。理由：阿罗德斯的本地语音一直是其优势叙事，但一次性全本地化工程量和模型分发成本高；混合方案先拿到"唤醒→识别→执行"完整闭环，本地识别作为可开关的第二阶段，风险最小。若用户明确要求"声音绝不出本机"，则直接选 A。

## 开放决策 D3：电脑操控的执行授权模型

- 状态：proposed
- 问题：桌面操控是高风险能力（能键入、点按钮、写文件、改系统设置）。语音误听 + 自动执行 = 真实事故面（例如误听"删除"类指令）。Daisy/HoloJarvis 均为本地单用户程序，默认全自动；阿罗德斯是持续运行的多面 Agent，需明确授权边界。

备选方案：
1. **A｜分级确认（推荐）**：低风险操作（开应用、调音量、读剪贴板、查窗口）自动执行；高风险操作（键入、写/删文件、系统设置、快捷键组合、浏览器提交动作）先播报待确认，语音或前端按钮确认后执行；每类操作可在设置中升降级。
2. B｜白名单：预先配置允许自动执行的应用/命令集合，其余一律确认。最安全，但配置负担重、日常使用繁琐。
3. C｜全自动：所有操作直接执行。响应最快，但误听误操作无兜底，且与"持续运行 Agent 可被任意触发"的形态叠加后风险不可接受。

推荐：**A**。理由：兼顾响应速度与安全底线；确认动作本身可语音化，不破坏"语音交互"体验；分级可配置，符合知识库"高风险项带开关/回滚"原则。

## 待第二轮决策（D1–D3 确认后再问）

- D4｜MCP 是否引入：HoloJarvis mcp_bridge 模式 vs 继续扩展自有技能注册表（简报强调 MCP 已是生态标准）。
- D5｜浏览器操作实现：Playwright/CDP vs 规则化站内搜索直达（B 站等），是否接入视觉理解。
- D6｜桌宠 HUD 升级是否纳入：TheFool 已有状态色联动；3D 粒子控制台/系统遥测较重，是否值得。
- D7｜语音生成增强：CosyVoice2 已有本地克隆与失败回退；是否加速启动、流式播放、增加系统嗓音回退。
- D8｜记忆基础设施：简报提到记忆走向基础设施（engram 等），是否引入外部记忆层（本轮默认不进范围）。

## 影响与后果

- M1 涉及 server 新工具模块（winops 抽象）+ 权限模型（D3）+ 前端确认 UI；所有新技能走现有 harness 注册表，不改变主循环与 WS 协议。
- 每项新能力必须带环境开关（如 `DESKTOP_TOOLS=off`）与测试证据，遵循 wu5 门禁；无新鲜验证证据不提交。
- 启动新变更前需：① 归档 desktop-shell（需用户授权）；② 处理 Hermes 未提交文件（用户决定 stash/提交/豁免）；③ `wu5_flow.py new voice-desktop-tools --type feature --mode full`。

## 确认记录

- [ ] D1 范围与交付顺序（A/B/C）
- [ ] D2 STT 策略（A/B/C）
- [ ] D3 执行授权模型（A/B/C）
- [ ] D4–D8 待第二轮

用户明确回复后，本文件相应条目改为 accepted 并填写确认人与时间，随后进入 to-spec 阶段。
