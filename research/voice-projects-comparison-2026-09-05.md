# 开源语音项目深度调研与 Arrodes 选型建议

> 调研日期：2026-09-05。结论针对 Arrodes 当前的 Windows/Electron、Node/TypeScript 编排、本地优先、RTX 4060 Laptop 8 GB 环境。项目性能数字若无特别说明，均为项目方自报，未在本机复测。

## 一句话结论

最值得现在做的不是把 Arrodes 整体换成某个“端到端语音大模型”，而是继续保留现有 **STT → LLM → TTS** 架构，并按这个顺序升级：

1. 借鉴 Hugging Face `speech-to-speech` 的 OpenAI Realtime 事件、Smart Turn、实时转写与可打断播放。
2. 把现有 CosyVoice2 升级/并行为 CosyVoice3；把 Audio8-TTS 0.1B/0.6B 加成轻量备选 TTS。
3. 只有需要浏览器多人、手机或电话接入时，再考虑 Pipecat 或 LiveKit Agents。
4. Moshi、MiniCPM-o、GLM-4-Voice、Step-Audio2、Qwen3-Omni 先作为远端实验，不作为 8 GB 显存机器的默认本地引擎。

## 先分清三类项目

| 类型 | 代表项目 | 它解决什么 | 它不解决什么 |
|---|---|---|---|
| TTS/声音克隆 | Audio8、CosyVoice3、GPT-SoVITS | 把文本变成语音、模仿音色 | 不负责听懂、思考、轮次和工具调用 |
| 级联语音 Agent 框架 | HF speech-to-speech、Pipecat、LiveKit、TEN、RealtimeVoiceChat | 把 VAD/STT/LLM/TTS/RTC 串起来 | 本身通常不是语音模型 |
| 端到端 speech-to-speech 模型 | Moshi、GLM-4-Voice、Step-Audio2、MiniCPM-o、Qwen3-Omni | 直接理解和生成语音，保留情绪/韵律并降低交互延迟 | 通常更吃显存、可替换性和可审计性较差 |

把这三类混在一起比“谁最好”没有意义。对 Arrodes，最重要的不是单项模型榜单，而是 **中文体验、8 GB 可运行、打断与轮次、工具/权限链不被破坏、可维护性**。

## 第一梯队：最值得 Arrodes 近期借鉴或接入

### 1. Hugging Face speech-to-speech — 最值得借鉴的整体管线

项目：[GitHub](https://github.com/huggingface/speech-to-speech) · Apache-2.0

它是低延迟的 VAD→STT→LLM→TTS 级联管线，暴露 OpenAI Realtime 核心事件，并支持 WebSocket/WebRTC；每个环节都可替换。当前支持 Silero VAD、Parakeet/Whisper/Faster-Whisper/Paraformer/Qwen3-ASR、OpenAI 兼容 LLM、Qwen3-TTS/Kokoro/Pocket/ChatTTS/OmniVoice，以及兼容 `/v1/audio/transcriptions` 和 `/v1/audio/speech` 的外部服务。[官方 README](https://github.com/huggingface/speech-to-speech#supported-components)

优点：

- 结构与 Arrodes 现有架构同类，不需要接受一个不可拆的端到端黑箱。
- Realtime 协议、实时转写、turn revision、barge-in、Smart Turn 都正好补 Arrodes 当前“按住说话/整段合成”的短板。
- 可以把 LLM、STT、TTS 放在本地或外部服务；模型缓存后支持离线运行。[离线说明](https://github.com/huggingface/speech-to-speech#offline-operation)
- OpenAI 兼容端点让现有 CosyVoice/未来 Audio8 可以通过适配器接入。

缺点：

- 它是 Python 编排层；整套引入会与 Arrodes 的 Node/TS 会话、记忆、工具、权限确认和 WebSocket 重叠。
- 默认组件在 Linux/macOS 路径更顺，Windows 下某些 Qwen3-TTS 原生轮子和 CUDA 版本仍需单独处理。
- 级联架构依然会叠加 VAD、STT、LLM、TTS 各段延迟；体验取决于选用模型而不是框架名。

建议：**借协议和轮次控制，不要第一步就整体迁移。** 优先复制它的事件状态机、取消传播、partial transcript 和 Smart Turn 思路到现有 Node 服务。

### 2. Fun-CosyVoice3 — 现有 TTS 的最低风险升级

项目：[GitHub](https://github.com/QwenAudio/CosyVoice) · [Gitee 镜像](https://gitee.com/TensorVoice/CosyVoice) · Apache-2.0

官方当前推荐 `Fun-CosyVoice3-0.5B`。它覆盖 9 种常用语言、18+ 中文方言/口音、跨语种零样本克隆、文本输入与音频输出双流式生成，并支持语言、方言、情绪、语速、音量等指令；项目方报告首包可低至 150 ms。[官方特性](https://github.com/QwenAudio/CosyVoice#key-features)

优点：

- Arrodes 已有 CosyVoice2 sidecar、环境、模型路径、重试和自定义音色接口，迁移摩擦最小。
- 中文、方言、数字/符号归一化、情绪控制比许多英文优先项目更匹配桌面管家。
- 0.5B 规模适合本机，且官方支持训练、FastAPI、vLLM、TensorRT-LLM 等路径。
- 相比 CosyVoice2，官方评测报告更好的内容一致性和音色相似度；但这些数字仍应本机 A/B 复测。[评测表](https://github.com/QwenAudio/CosyVoice#evaluation)

缺点：

- 仍然只是 TTS，不会自动带来更好的 VAD、STT、打断或回声消除。
- 子模块、sox、文本前端和推理加速依赖多；vLLM 只对若干版本组合测试过。
- 直接覆盖当前 `cosyvoice` 环境风险高，应新建隔离环境和新端口并行验证。

建议：**近期首选。** 先做同一组中文、数字、专名、长回复、情绪和自定义音色样本的 CosyVoice2/3 A/B，再决定默认切换。

### 3. Audio8-TTS — 很有价值的轻量 TTS/CPU 备选

项目：[GitHub](https://github.com/Edge0-AI/Audio8_TTS) · Apache-2.0

Audio8 不是完整的 speech-to-speech Agent，而是 TTS。官方提供 0.6B 多语言零样本声音克隆模型，也新增 0.1B 紧凑版本；支持 11 种推荐语言、44.1 kHz、OpenAI 兼容 `/v1/audio/speech`、SSE/PCM 流式输出、SFT，以及不依赖 PyTorch 的 ONNX INT4 CPU 部署。[官方 README](https://github.com/Edge0-AI/Audio8_TTS)

优点：

- 0.1B/0.6B 比多数高质量克隆模型小，适合作为“显卡忙时走 CPU”的第二引擎。
- ONNX 0.6B 官方在 Apple M2 上报告会话约 1 GiB 内存；对桌面分发很有吸引力，但 Windows 仍需实测。
- 接口接近 OpenAI TTS，容易做成统一 provider；支持参考音频注册和流式 PCM。
- 许可证宽松，仓库仍在快速迭代。

缺点：

- 当前明确标为 Preview，推荐语言之外覆盖有限。
- 官方建议每段不超过 150 字符，长文本需要 Arrodes 自己可靠分句、拼接和取消。
- 零样本克隆需要准确的参考音频转写。
- 0.116 RTF/0.691 秒是 H20 暖机单流测试，不能推断 4060 或 CPU 的首包体验。
- 不含 STT、LLM、VAD、轮次检测和工具调用。

建议：**作为可插拔 TTS 候选，不要把它当完整语音系统。** 优先试 0.1B ONNX/0.6B ONNX 的中文自然度和 Windows 延迟。

### 4. GPT-SoVITS — 最强项是人物音色制作

项目：[GitHub](https://github.com/RVC-Boss/GPT-SoVITS) · [Gitee 镜像示例](https://gitee.com/botezhou/GPT-SoVITS) · MIT

优点：

- 5 秒参考音频可零样本合成，约 1 分钟数据可小样本微调；很适合固定“阿罗德斯角色声线”。
- 支持中、英、日、韩、粤语，集成切片、降噪、ASR、标注、训练和 WebUI。
- Windows 10+ 有整合包和 PowerShell 安装路径；官方也提供 API。
- 社区大、教程多；官方给出 4060 Ti 上 v2 ProPlus 很快的自报数据。[功能与环境](https://github.com/RVC-Boss/GPT-SoVITS#features)

缺点：

- 它更像“声音制作工作室”，不是实时语音 Agent 框架。
- v1/v2/v3/v4/v2Pro/ProPlus 模型组合多，权重、环境和音色资产管理复杂。
- 情绪控制、长文本稳定性和跨语言表现高度依赖参考素材与版本。
- 接入实时对话仍需自行完成分句、流式播放、打断、回声消除和轮次控制。

建议：如果目标是“做出独特、稳定的人物声线”，把它作为离线音色制作/候选 TTS；如果目标是“对话更流畅”，它不是第一优先级。

### VoxCPM2 — 描述式造音色是真的，但并不轻

项目：[GitHub](https://github.com/OpenBMB/VoxCPM)

VoxCPM2 的 Voice Design 支持只写自然语言音色描述后直接生成语音，不需要参考音频；同时也支持可控克隆和高相似度克隆。官方当前模型为 2B、48 kHz、覆盖 30 种语言。[官方 README](https://github.com/OpenBMB/VoxCPM)

优点：

- “年轻、温柔、沙哑、沉稳”等描述可以直接成为音色条件，适合快速探索角色声音，省去寻找、剪辑和转写参考音频的步骤。
- 既能描述造音色，也保留参考音频克隆路线，创作自由度高。
- 48 kHz 输出和多语言覆盖适合成品配音与角色原型。

缺点：

- 免参考音频只降低工作流负担，不降低推理负担。
- 官方资源表显示：支持 Voice Design 的 VoxCPM2 约需 8 GB 显存；较小的 VoxCPM1.5/0.5B 约需 6/5 GB，但不支持 Voice Design。
- 在本机 RTX 4060 Laptop 8 GB 上几乎没有给桌面 UI、视觉模型或并发任务留下显存余量，OOM 风险高于 CosyVoice3。

建议：作为“角色音色设计/离线生成”的可选引擎继续观察，不替换 Arrodes 默认实时 TTS。若要试，必须与 CosyVoice3 串行加载并先做 8 GB OOM 测试。

## 第二梯队：需要扩展到 WebRTC、电话或多端时再采用

### 5. Pipecat

项目：[GitHub](https://github.com/pipecat-ai/pipecat) · BSD-2-Clause

优点：实时语音/视频优先，供应商适配面广，流水线可组合，WebSocket/WebRTC、工具调用和多 Agent 都成熟；许可证宽松。[项目说明](https://github.com/pipecat-ai/pipecat)

缺点：Python 运行时和自己的 frame/pipeline 抽象会与 Arrodes 现有 Harness/EventBus/工具权限重复；大量适配器背后仍可能是付费云服务；对单机 Electron 来说偏重。

建议：需要多供应商快速试验、电话机器人或独立语音服务时选；当前更适合阅读其打断、帧传递和 processor 设计。

### 6. LiveKit Agents

项目：[GitHub](https://github.com/livekit/agents) · Apache-2.0

优点：WebRTC 客户端覆盖广，内置任务调度、电话接入、语义轮次检测、MCP 和 Agent 测试；全栈可自托管。[官方特性](https://github.com/livekit/agents#features)

缺点：要发挥优势通常需要 LiveKit server/房间/worker 等媒体基础设施；对本地单用户桌面会增加部署和运维；它不提供本地中文模型质量保证。

建议：以后做手机端、网页远程语音、多人房间、SIP 电话时优先评估；现在不必替换本地 WebSocket。

### 7. TEN Framework

项目：[GitHub](https://github.com/TEN-framework/ten-framework)

优点：RTC/WebSocket、多模态、VAD、Turn Detection、记忆、数字人唇形、SIP 与嵌入式示例都很完整。[项目示例](https://github.com/TEN-framework/ten-framework#agent-examples)

缺点：**许可证是决定性风险。** 官方 LICENSE 在 Apache 2.0 之外，禁止把 TEN Framework/衍生物托管到终端设备，也限制与 Agora 产品竞争。[许可证原文](https://github.com/TEN-framework/ten-framework/blob/main/LICENSE)

建议：**不作为 Arrodes 桌面端基础依赖。** 可以学习架构和示例，但在没有法律确认前不要复制核心代码或打包分发。

### 8. RealtimeVoiceChat

项目：[GitHub](https://github.com/KoljaB/RealtimeVoiceChat) · [Gitee 模力方舟应用](https://ai.gitee.com/apps/9804e04e-c14a-48e9-9508-1851688e9b7c)

优点：浏览器→WebSocket→RealtimeSTT→LLM→RealtimeTTS 的链路直观；有 partial transcript、动态静音检测和可打断播放；Windows 安装脚本与 Docker 都有，适合读懂一个完整最小实现。

缺点：作者已明确停止主动维护，只偶尔合并社区 PR；仓库顶层未给出明确 LICENSE，因此代码复用边界不清晰。[维护声明](https://github.com/KoljaB/RealtimeVoiceChat#real-time-ai-voice-chat-)

建议：只作为“如何做打断和流式浏览器音频”的参考，不作为长期依赖。Gitee 页面只是应用展示，实际代码上游仍是 GitHub。

## 第三梯队：端到端/全双工研究储备

### 9. Moshi

项目：[GitHub](https://github.com/kyutai-labs/moshi) · 代码 MIT/Apache，权重 CC-BY-4.0

优点：真正同时建模用户和助手两路音频，能边听边说；官方给出理论 160 ms、L4 上实际低至约 200 ms；提供 PyTorch、MLX、Rust/Candle 和 Web 客户端，是研究全双工最好的参考之一。[架构与延迟](https://github.com/kyutai-labs/moshi#model-architecture)

缺点：官方称 PyTorch 路径需要约 24 GB 显存，Windows 不正式支持；现成模型主要是两个固定合成音色；CLI 没有回声消除或积压补偿；把工具、可靠文本记录、中文体验和权限链接入仍需大量工程。

结论：**研究价值高，本机落地价值低。** 学习双音频流、codec 和 duplex 状态机即可。

### 10. GLM-4-Voice

项目：[GitHub](https://github.com/zai-org/GLM-4-Voice) · 代码 Apache-2.0，权重遵循单独模型协议

优点：9B 中英语音端到端模型，能按指令控制情绪、语调、语速和方言；同时输出文本与语音，有 Int4 启动方式。[模型与用法](https://github.com/zai-org/GLM-4-Voice)

缺点：要部署 tokenizer、9B chat model 和独立 decoder；官方 Web demo 的流式音频已知不稳定；权重不是单纯 Apache-2.0；没有清晰的 8 GB 官方配置。

结论：适合远端 GPU 验证“中文情绪语音对话”，不建议直接塞进本机桌面包。

### 11. Step-Audio2 mini

项目：[GitHub](https://github.com/stepfun-ai/Step-Audio2) · Apache-2.0

优点：端到端音频理解与语音对话，强调情绪/年龄等副语言信息、非语音声音、工具调用和多模态 RAG；模型和 ModelScope/Hugging Face 入口公开。[官方介绍](https://github.com/stepfun-ai/Step-Audio2#introduction)

缺点：本地依赖 CUDA、特定 Transformers 和定制 vLLM；官方推荐 vLLM/多 GPU，Docker 构建提示需 32 GiB 主存；仓库示例证明可推理，不等于开箱即用的低延迟全双工桌面会话。

结论：如果未来要让语音模型直接感知情绪并调用工具，值得在服务器上实验；当前本机优先级低。

### 12. MiniCPM-o 4.5

项目：[GitHub](https://github.com/OpenBMB/MiniCPM-V#minicpm-o-45) · Apache-2.0

优点：9B，把视觉、音频、文本和语音生成统一起来；支持中英实时对话、声音克隆、全双工连续音视频输入输出和主动评论/提醒。对“能看、能听、能说”的阿罗德斯远期形态非常契合。[官方说明](https://github.com/OpenBMB/MiniCPM-V#minicpm-o-45)

缺点：官方列出的 BF16 约 19 GB、GGUF 约 10 GB、AWQ 约 11 GB，均超过当前 8 GB 显存；完整全双工 demo 的资源开销还高于单轮推理。[模型资源表](https://github.com/OpenBMB/MiniCPM-V#model-zoo)

结论：**远期最值得跟踪的端到端候选之一，但当前硬件不适合。**

### 13. Qwen3-Omni

项目：[GitHub](https://github.com/QwenLM/Qwen3-Omni) · Apache-2.0

优点：原生端到端音视频/文本模型，支持 19 种语音输入和 10 种语音输出，能实时输出文本和自然语音，系统提示可控制行为。[官方概览](https://github.com/QwenLM/Qwen3-Omni#overview)

缺点：30B-A3B BF16 官方最低显存约 68.74–78.85 GB，远超本机；vLLM serve 当前只支持 thinker，完整 Talker/实时语音路径受限。[显存与 vLLM 说明](https://github.com/QwenLM/Qwen3-Omni#usage-tips-recommended-reading)

结论：适合作为云端/多卡服务器能力，不适合 8 GB 本地桌面默认后端。

## Gitee 调研结论

Gitee 上能找到 CosyVoice、GPT-SoVITS 等镜像，也能在模力方舟直接体验 RealtimeVoiceChat；但这些页面大多仍指向 GitHub 原仓库、是 fork/镜像或应用封装。优点是中国大陆下载、ModelScope 权重和中文说明更方便；缺点是版本可能滞后、许可证信息不完整、Issue/PR 不在真正上游。

因此选型时应遵循：**Gitee/ModelScope 用来下载和体验，GitHub 官方仓库与模型卡用来判断版本、维护状态和许可证。**

## 最终排序（针对 Arrodes，不是通用榜单）

| 排名 | 项目 | 建议 | 主要理由 |
|---:|---|---|---|
| 1 | HF speech-to-speech | 借鉴核心机制 | Realtime 协议、Smart Turn、barge-in 正中当前短板 |
| 2 | CosyVoice3 | 近期 A/B 接入 | 与现有 sidecar 最接近，中文/方言/流式强 |
| 3 | Audio8-TTS | 新增轻量备选 | 0.1B/0.6B、ONNX、OpenAI 兼容、CPU 可能可用 |
| 4 | GPT-SoVITS | 做角色音色时接入 | 人物声音定制强，实时编排弱 |
| 5 | Pipecat | 架构参考/独立服务候选 | 供应商生态与实时流水线成熟 |
| 6 | LiveKit Agents | 多端/电话阶段再上 | WebRTC、SIP、调度和 MCP 完整 |
| 7 | MiniCPM-o 4.5 | 远端实验、持续跟踪 | 最契合“看听说”愿景，但显存不够 |
| 8 | Step-Audio2 mini | 远端研究 | 情绪、工具调用、音频理解强，部署重 |
| 9 | GLM-4-Voice | 中文情绪对话实验 | 功能好但多组件、许可和本机显存风险 |
| 10 | Moshi | 双工架构研究 | 真全双工，但 Windows/24 GB 门槛不匹配 |
| 11 | Qwen3-Omni | 云端/多卡储备 | 能力全面，资源量级完全不适合本机 |
| 12 | RealtimeVoiceChat | 只读参考 | 简洁，但停止主动维护且无明确 LICENSE |
| 13 | TEN | 不采用 | 桌面部署与竞争限制构成决定性许可证风险 |

## 推荐实施路线

### P0：先把“实时感”补齐，不换大模型

- 在现有 Node WebSocket 上定义 OpenAI Realtime 风格事件：audio append/commit、speech started/stopped、partial transcript、response audio delta、response cancel。
- 引入语义轮次检测：VAD 只判断“有没有说话”，Smart Turn 再判断“话说完没有”。
- 用户插话时同时取消 LLM 流、TTS 生成和前端播放队列，避免只停播放器但后台仍继续算。
- 增加回声消除、噪声门和播放期间拾音策略；这是全双工体验能否成立的基础。

### P1：TTS 多后端

- 保留 `TtsService` 统一入口，新增 `cosyvoice2 | cosyvoice3 | audio8` provider，而不是把模型逻辑写死。
- CosyVoice3 使用独立 Python 环境和新端口，先并行 A/B，禁止直接污染当前可用的 CosyVoice2 环境。
- Audio8 优先验证 ONNX 0.1B/0.6B：中文自然度、首包、CPU 占用、150 字切分、打断后的资源释放。
- 为所有声音克隆入口加入授权确认、参考音频来源记录、合成标识与删除能力。

### P2：再决定是否引入框架

- 单机 Electron：继续现有 Node 编排。
- 网页/手机/多人/电话：评估 LiveKit Agents。
- 多供应商快速实验或独立 Python voice service：评估 Pipecat。
- 全双工端到端：用远端 GPU 做 MiniCPM-o/Step-Audio2/GLM-4-Voice 对照实验，达到明确延迟、中文质量、工具调用和成本门槛后，再接成可选 provider。

## 验收指标建议

不要只听一条 Demo。至少统一测试：

- 首包延迟、完整回复延迟、实时因子 RTF；冷启动和热启动分开。
- 用户插话到停止出声的延迟，以及取消后 GPU/CPU 是否继续占用。
- 中文数字、英文缩写、人名地名、长文本、方言、情绪、低质量麦克风。
- STT 字错率、TTS 可懂度、音色相似度、音量一致性与长时间重复/漏字。
- 8 GB 显存峰值、主存、安装体积、离线可用性、崩溃恢复。
- 权重与代码许可证、克隆音频授权、日志是否泄露对话内容。

## 主要来源

- [Audio8-TTS 官方仓库](https://github.com/Edge0-AI/Audio8_TTS)
- [Hugging Face speech-to-speech 官方仓库](https://github.com/huggingface/speech-to-speech)
- [CosyVoice 官方仓库](https://github.com/QwenAudio/CosyVoice)
- [GPT-SoVITS 官方仓库](https://github.com/RVC-Boss/GPT-SoVITS)
- [Pipecat 官方仓库](https://github.com/pipecat-ai/pipecat)
- [LiveKit Agents 官方仓库](https://github.com/livekit/agents)
- [TEN Framework 官方仓库与许可证](https://github.com/TEN-framework/ten-framework/blob/main/LICENSE)
- [RealtimeVoiceChat 官方仓库](https://github.com/KoljaB/RealtimeVoiceChat)
- [Moshi 官方仓库](https://github.com/kyutai-labs/moshi)
- [GLM-4-Voice 官方仓库](https://github.com/zai-org/GLM-4-Voice)
- [Step-Audio2 官方仓库](https://github.com/stepfun-ai/Step-Audio2)
- [MiniCPM-o 官方仓库](https://github.com/OpenBMB/MiniCPM-V#minicpm-o-45)
- [Qwen3-Omni 官方仓库](https://github.com/QwenLM/Qwen3-Omni)
