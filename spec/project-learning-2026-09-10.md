# Arrodes 重新学习记录 · 2026-09-10

研究根目录：`E:/project/Arrodes`；应用代码根：`E:/project/Arrodes/Arrodes`。
源码基准：HEAD `f0a2190`，分支 `feature/desktop-pet-vision`，并包含当前未提交和未跟踪实现。此次没有改业务代码、运行配置或用户数据。

## 产品与当前实现

目标仍是感知屏幕、结合记忆提供单步指导并在授权后代办的本地个人管家。编码与多 Agent 工作区是已有后台能力。屏幕指导的代码存在不等于真实桌面闭环已经验收。

| 层 | 入口与职责 |
|---|---|
| 桌面宿主 | `Arrodes/desktop/main.ts`：启动 Node 后端、等待健康检查、注入本地临时访问凭据、管理主窗口/桌宠/管家控制台，以及网关和视觉侧车生命周期 |
| React 表面 | `Arrodes/client/src/main.tsx`：按 surface 参数选择 App、DesktopPetOverlay、ButlerConsole |
| 对话服务 | `Arrodes/server/src/index.ts`：Express REST、`/v1/chat` WebSocket、SQLite 初始化、技能注册和主循环 |
| 屏幕观察 | `useContinuousVision.ts`：主窗口共享屏幕、灰度变化检测、过滤低信息帧、排除桌宠区域、请求视觉分析并广播结构化观察 |
| 桌宠 | `DesktopPetOverlay.tsx`：小球/VRM/图片形象与 Live2D 实现分支、观察展示、独立聊天及按住说话；petCamera 是 VRM 渲染机位，不是物理摄像头 |
| 活动记忆 | `butler/butler.py`：默认每 20 秒采集、变化保存、十分钟分段、分析队列和 JSON 落盘 |
| 管家桥接 | `butlerService.ts` + `routes/butler.ts`：读取记录与日汇总、启动/停止引擎；`butler-app` 独立控制台继续保留 |
| 语音 | 客户端录音/STT/TTS 管线，服务端 CosyVoice3 与可选 Audio8；README 中 CosyVoice2 描述已过时 |

## 核心链路

1. 对话：MessageChannel → WS handler → 校验会话/工作区并保存消息 → 显式记忆或待确认动作快路径 → Harness 路由 main/memory/dev → main 检索画像与记忆、拼接历史和可选 visualContext → LLM 流式输出及最多三轮技能调用 → 保存回复 → memory Agent 对话后提取 → complete/memory 事件。
2. 屏幕：App 唯一观察控制器 → getDisplayMedia → 变化采样 → `/api/v1/vision/analyze-base64` → 结构化解析与 Arduino IDE 规则 → EventBus/BroadcastChannel → 桌宠展示。Arduino 规则处理编译失败、编译完成、上传成功；通用低置信观察不应直接产生行动。
3. Butler：屏幕变化图 → 小时记录 → 待处理十分钟段 → 最近代表图加前段上下文 → 一次结构化分析和四次扩写 → 汇总 JSON。当前实际推理主要看最后一张代表图，不能把长描述当成整个十分钟完整视频证据。
4. 跨实例采集协调：共享数据目录的 `_butler/engine.json` + PID 活性、`state.json` 心跳与 `stop.flag`；主应用与独立控制台共用约定。源码含启停测试，但本次未执行采集或停止真实引擎。

## 与旧记忆不同的事实

- Butler 已有主应用导航、服务端路由与引擎协调实现；不能再概括为“完全未接入”。不过核心 Butler 服务和引擎仍有未跟踪文件，HEAD 单独检出不足以代表当前工作区。
- `visionService.ts` 当前默认 `VISION_PROVIDER=ollama`、`qwen3-vl:4b-instruct`；Mage-VL 分支保留。新增 `qwen_vl_sidecar.py` 将 `/analyze` 协议转发到 Ollama，供 Butler 等旧调用方复用。Node 默认路径直接请求 Ollama，并非所有视觉请求都经过 Python。
- 桌宠已有独立会话和指导型简短人设；对话用户体验与真实模型效果尚未在此次研究中验收。
- 当前有四类不同记忆：SQLite 对话记忆/画像、工作区记忆及 Obsidian 导出、knowledge 技能知识点、Butler 活动 JSON。`MemoryGateway.retrieveContext` 仍是关键词命中与时间排序、取最多五条跨会话记忆；未见其接入 Butler 汇总。查看历史面板不等于对话能召回历史活动。
- 根 README 仍写旧 PyQt TheFool 与 CosyVoice2；历史 spec/status 的阶段不可用来判断产品完成度。

## 迁移与工程注意点

1. `Arrodes/server/.env` 第 3 行 `DB_PATH` 仍含旧 `Crow5` 目录。数据库实际位置取决于运行环境覆盖，不能只凭代码搬迁判断数据已迁移；此次未改配置或搬动数据库。
2. `Arrodes/server/src/workspace/connectors.ts` 的 WorkBuddy 默认目录仍是 `E:/project/Crow5/Arrodes/.workbuddy`；环境变量可覆盖。README 示例和输入框提示也有旧路径。
3. `desktop/main.ts` 的 startVisionSidecar 使用 `join(__dirname, '../vision-sidecar/...')`。当入口为 desktop/dist/main.js 时，它指向 desktop/vision-sidecar，而实际侧车在应用根的 vision-sidecar；已检查前者脚本不存在、后者存在。这是静态路径缺陷，未启动应用复现。
4. desktop 的 extraResources 列表未包含 Butler 引擎目录，视觉侧车也未携带默认 .venv。当前本机开发可用与安装包可独立运行要分开验收。
5. 屏幕观察与 Butler 是两条采集链；主窗口对自身桌宠区域的排除不能推定 Python ImageGrab 同样具备。后续需明确两者同时运行的采样、资源与证据边界。
6. SQLite 与个人画像、外部模型/解释器、Ollama 和 Obsidian 都是仓库外或运行期依赖。尤其 `E:/project/HermesProject/Obsidian/TheFool` 是受保护的真实数据目录，与已删除的仓库旧 TheFool 无关。

## 此次验证与边界

- server：`npm run typecheck` 通过。
- client：本地 tsc `-b --pretty false --noEmit` 通过。
- desktop：本地 tsc `-p tsconfig.json --noEmit --pretty false` 通过。
- 阅读了现有测试与 Butler 历史验证记录；历史记录仍留有全量验证和真实验收未勾选项，不能补写成当前通过。
- 未运行全量测试、真实截图、模型推理、语音、打包或安装包验收。没有可调用 GitNexus 工具，本次以直接源码追踪为依据，不声明索引新鲜度。

后续工作优先核实迁移后的运行配置和启动链，再验收“真实屏幕 → 判断 → 桌宠建议”，以及“历史活动提问 → 来源引用 → 修正后再次召回”两个闭环。
