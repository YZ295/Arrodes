# 开源语音项目深度调研：证据底稿

- 日期：2026-09-05
- 读者：Arrodes 项目维护者
- 决策：在 RTX 4060 Laptop 8 GB、Windows 桌面应用、本地优先的约束下，选择值得借鉴或接入的语音项目
- 范围：GitHub、Gitee/模力方舟、ModelScope/Hugging Face 入口；优先官方仓库与官方许可证
- 排除：纯商业闭源 API 的价格横评；没有公开代码或无法核验许可证的下载站整合包

## 直接结论

Arrodes 不应为了追求“端到端 speech-to-speech”而整体替换现有 Node/TS + STT + LLM + CosyVoice2 架构。当前硬件只有 8 GB VRAM，而真正全双工的本地模型普遍要求 10–24 GB 以上，Qwen3-Omni 更达到约 69–79 GB BF16 起步。更低风险、回报更高的路线是：保留现有编排层，先引入 OpenAI Realtime 兼容事件、语义轮次检测和打断取消；把 CosyVoice3 与 Audio8-TTS 做成可切换 TTS 后端；把 MiniCPM-o、Moshi、GLM-4-Voice 等保留为远端实验后端。

## 关键证据与判断

### Audio8-TTS

官方仓库把它定义为 0.6B 多语言 TTS 和零样本克隆模型，而不是完整语音助手。支持 11 种推荐语言、44.1 kHz、OpenAI 兼容服务和流式 PCM；还提供 0.6B ONNX INT4 CPU 部署，官方在 Apple M2 上报告约 1 GiB 会话内存。限制是 Preview 状态、建议单段不超过 150 字符、参考文本必须与参考音频匹配；SGLang 的低延迟数字来自 H20 暖机测试，不代表本机 4060。

### Hugging Face speech-to-speech

这是级联式 VAD→STT→LLM→TTS 管线，提供 OpenAI Realtime 核心事件的 WebSocket/WebRTC 服务。支持 Silero VAD、Parakeet/Whisper/Faster-Whisper/Paraformer/Qwen3-ASR、多种 TTS 与 OpenAI 兼容 STT/TTS 端点，并有 Smart Turn、实时转写、turn revision、barge-in 和离线模式。最值得 Arrodes 复用的是协议与轮次控制，不一定是整套 Python 编排，因为 Arrodes 已有 Node/TS 会话、工具、权限与记忆层。

### CosyVoice3

当前官方仓库推荐 0.5B 的 Fun-CosyVoice3，支持 9 种语言、18+ 中文方言/口音、跨语种零样本克隆、文本/音频双流式输出和指令式情绪/语速/音量控制，官方宣称首包低至 150 ms。与 Arrodes 现有 CosyVoice2 技术栈最接近，升级成本最低；但依赖和子模块仍复杂，vLLM 版本要求严格，应隔离环境并做 A/B 测试。

### GPT-SoVITS

官方仓库支持 5 秒零样本、约 1 分钟小样本微调，中英日韩粤语，Windows 一键包和 API。优势是人物音色定制与社区成熟；缺点是它是训练/数据处理/TTS 工具箱，不负责实时轮次、回声消除或 Agent 编排，版本与模型组合多，运维复杂。

### Pipecat / LiveKit Agents / TEN

Pipecat 是宽生态的 Python 实时语音与多模态管线，BSD-2-Clause，适合多供应商和多 Agent；LiveKit Agents 以 WebRTC、电话、任务调度、语义轮次和 MCP 为强项，适合网络化产品。两者对单机 Electron 会引入第二套编排或媒体基础设施。TEN 功能完整，但其 LICENSE 在 Apache 2.0 外明确限制部署到终端设备及与 Agora 竞争，不适合作为 Arrodes 桌面端基础依赖。

### RealtimeVoiceChat

它把浏览器音频经 WebSocket 送入 RealtimeSTT→LLM→RealtimeTTS，并实现动态静音检测和打断，结构简单、适合参考。但作者已声明不再主动维护；仓库顶层也没有明确 LICENSE 文件，因此不宜直接复制代码。Gitee 模力方舟展示的是该 GitHub 项目的应用入口，不是独立维护的 Gitee 上游。

### 端到端模型

- Moshi：真正双音频流、理论 160 ms/官方 L4 实测低至约 200 ms；但 PyTorch 官方建议约 24 GB 显存，Windows 不正式支持，模型只有两个合成音色，适合作为全双工研究参考。
- GLM-4-Voice：9B，中英端到端、情绪/语速/方言控制，Int4 可启动；但要同时部署 tokenizer、9B chat 和单独 decoder，官方还承认 Gradio 流式播放不稳定，权重另有模型协议。
- Step-Audio2 mini：端到端音频理解、情绪/副语言、工具调用与多模态 RAG，Apache 2.0；但本地栈绑定 CUDA、特定 Transformers/vLLM，官方 Docker 构建提示需 32 GiB 主存，真正实时体验更多由其云端控制台承载。
- MiniCPM-o 4.5：9B，中英语音、视觉、全双工和主动式音视频交互；官方给出的 BF16/量化显存约 19/10–11 GB，超过本机 8 GB。
- Qwen3-Omni：19 种语音输入、10 种语音输出、实时音视频；但 30B-A3B BF16 官方最低显存约 69–79 GB，且 vLLM serve 当前只支持 thinker，不适合本机桌面默认后端。

## 证据缺口与置信度

- 高置信：项目定位、语言范围、公开协议、官方写明的显存/延迟/已知问题。
- 中置信：对 Arrodes 的集成工作量和维护风险，这是依据现有代码结构与官方依赖做出的工程推断。
- 未验证：没有在本机下载并运行这些大型模型；各项目的音质、中文口音、首包延迟不能只凭作者自报横向比较。
- 许可证提醒：模型权重许可可能与代码许可不同，尤其 GLM-4-Voice、Moshi；语音克隆还需要独立的授权、告知与反冒用机制。

## 检索与停止条件

第一轮用项目名、speech-to-speech、realtime voice agent、Gitee 中文关键词发现候选；第二轮逐一核验官方 README、许可证、硬件要求、协议与维护声明；第三轮以 Arrodes 当前代码与 `nvidia-smi` 核验本机约束。已覆盖 TTS、级联框架、RTC 框架和端到端模型四类，关键推荐均有一手证据，继续扩大候选不会改变当前 8 GB 本地优先结论，因此停止。

## Claim-to-source ledger

| 结论 | 一手来源 | 发布者 | 访问日期 | URL |
|---|---|---|---|---|
| Audio8 0.6B/0.1B、语言、ONNX、150 字限制、流式/API、H20 指标 | Audio8_TTS README | Edge0-AI | 2026-09-05 | https://github.com/Edge0-AI/Audio8_TTS |
| HF 级联管线、Realtime、组件、Smart Turn、离线 | speech-to-speech README | Hugging Face | 2026-09-05 | https://github.com/huggingface/speech-to-speech |
| CosyVoice3 语言、方言、双流、150 ms、评测 | CosyVoice README | QwenAudio/FunAudioLLM | 2026-09-05 | https://github.com/QwenAudio/CosyVoice |
| GPT-SoVITS 零/小样本、语言、Windows、速度 | GPT-SoVITS README | RVC-Boss | 2026-09-05 | https://github.com/RVC-Boss/GPT-SoVITS |
| Pipecat 功能与 BSD-2-Clause | Pipecat README/LICENSE | Daily / Pipecat | 2026-09-05 | https://github.com/pipecat-ai/pipecat |
| LiveKit WebRTC/电话/轮次/MCP/测试 | Agents README | LiveKit | 2026-09-05 | https://github.com/livekit/agents |
| TEN 功能与附加许可证限制 | TEN README/LICENSE | Agora | 2026-09-05 | https://github.com/TEN-framework/ten-framework |
| RealtimeVoiceChat 架构与停止维护声明 | RealtimeVoiceChat README | KoljaB | 2026-09-05 | https://github.com/KoljaB/RealtimeVoiceChat |
| Moshi 双流、延迟、24 GB、Windows、许可 | Moshi README | Kyutai | 2026-09-05 | https://github.com/kyutai-labs/moshi |
| GLM-4-Voice 9B、端到端、Int4、已知问题、许可 | GLM-4-Voice README | Z.ai/THUDM | 2026-09-05 | https://github.com/zai-org/GLM-4-Voice |
| Step-Audio2 能力、许可、依赖/部署 | Step-Audio2 README | StepFun | 2026-09-05 | https://github.com/stepfun-ai/Step-Audio2 |
| MiniCPM-o 4.5 全双工与显存 | MiniCPM-V/o README | OpenBMB | 2026-09-05 | https://github.com/OpenBMB/MiniCPM-V |
| Qwen3-Omni 语言、实时能力、显存、vLLM 限制 | Qwen3-Omni README | Qwen | 2026-09-05 | https://github.com/QwenLM/Qwen3-Omni |
| Gitee 镜像/应用情况 | CosyVoice mirror、RealtimeVoiceChat app | Gitee | 2026-09-05 | https://gitee.com/TensorVoice/CosyVoice ; https://ai.gitee.com/apps/9804e04e-c14a-48e9-9508-1851688e9b7c |

