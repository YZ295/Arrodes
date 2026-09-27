# Ashley 桌面语音助手 — 深度分析

> 学习对象：`E:\project\ashley-desktop-assistant-main-win-1.0\ashley-desktop-assistant-main`
> 学习时间：2026-09-26　｜　性质：**纯只读分析，未修改对方项目任何文件**
> 代码规模：`src/` 约 9,975 行（30 个文件），核心三文件 main.ts 2071 / app.ts 2205 / voice.ts 2267

---

## 一、这是什么项目

### 1.1 血统

一个**二次改造项目**，不是原创：

| | 原项目 | 现状（改造后） |
|---|---|---|
| 平台 | macOS 13+ / Apple Silicon | Windows（PowerShell + NSIS） |
| 唤醒 | openWakeWord「Hey Jarvis」 | Sherpa-ONNX KWS（WASM）中文「贾维斯」 |
| 声纹 | openWakeWord 96 维 + WASM diarization | Sherpa-ONNX-Node ERes2Net 512 维（主进程原生） |
| 对话 | OpenAI Realtime（WebRTC） | 豆包 Seeduplex 全双工（WebSocket），OpenAI 保留为备选 |
| 3D 形象 | CC-BY 科幻头盔（程序化 PBR，紫色） | 黑金 Tripo 单体网格（自带贴图，59994 面） |
| 音效 | `assembly.wav` | `yes.wav` |

原作者的 Community Edition 是完整可跑的助手，**故意砍掉了两块**：Codex 桥（可写代码/驱动 macOS 辅助功能）和全息地图（依赖私有应用）。砍掉的是整块功能，不是留桩。

改造者（本项目实际作者）写了一份 `项目说明.md`，自述"改动量 7 个文件 +366/-69 行"——**这个数字只统计了源码改动，远小于真实工作量**（平台迁移、模型替换、唤醒引擎整套替换、声纹重构、几个 bug 的根因定位都没算进去）。

### 1.2 产品形态

透明置顶的 3D 头盔浮在桌面上，语音唤醒后播放粒子装配动画、居中放大 960px，全双工对话；执行"打开应用"这类可见操作后缩到右下角 220px 常驻（docked）；说"退下"则完全隐藏回到监听。

---

## 二、架构全景

### 2.1 三个进程边界、四个窗口

```
┌──────────── Electron 主进程 (main.ts) ─────────────┐
│  状态机 currentJarvisState: idle/listening/thinking/speaking
│  可见性状态机 avatarVisibilityMode:
│     sleeping / auto / forced-visible / forced-hidden / docked
│  托盘 / 全局快捷键 / 天气 / 应用启停 / 观澜只读查询
│  声纹原生模块（sherpa-onnx-node，单例懒加载）
│  豆包 WebSocket 传输（主进程持有 socket，不暴露凭据给渲染层）
└───────┬─────────────────────────┬──────────────────┘
        │ IPC (preload.ts contextBridge)
        ▼                         ▼
  视觉窗口 effects.html        语音核心窗口 voice.html
  app.ts (Three.js)            voice.ts (2267 行)
  960px / 220px 锚点            1×1 大小，x/y = -10000 屏幕外
  focusable:false                show:false, backgroundThrottling:false
  setIgnoreMouseEvents(true)     KWS 引擎 + 声纹客户端 + 会话
  ← 纯点击穿透覆盖层              ← 永不显示，真正的"后台耳朵"

  第三个窗口：wake-enrollment.html（560×570，声纹录入 UI）
```

**关键设计**：视觉层与语音核**完全解耦**。`jarvisWindow` 崩溃/无响应 → 只 reload 视觉窗口；`voiceWindow` 崩溃 → 主进程自动重建（`render-process-gone` → `createVoiceWindow()`）。视觉窗口重载期间语音链路不受影响。

### 2.2 模块地图

| 文件 | 行数 | 职责 |
|---|---:|---|
| `main/main.ts` | 2071 | 窗口/状态机/工具执行/托盘/两种 provider 的 session config |
| `main/preload.ts` | 180 | 唯一 IPC 契约（37 个方法），含 sender 校验与 provider 选择逻辑 |
| `main/doubao-voice-transport.ts` | 165 | 主进程侧 WebSocket，仅转发文本帧给渲染层 |
| `main/speaker-verify-native.ts` | 151 | 原生声纹：512 维嵌入提取 + 余弦相似度 |
| `main/weather.ts` / `environment.ts` | 136 / 57 | 和风天气 / .env 加载与"app 自有配置"钉死 |
| `renderer/app.ts` | 2205 | GLTF 加载、装配 shader、全息 shader、手势、待机动作、渲染节流 |
| `renderer/voice.ts` | 2267 | KWS 生命周期、健康自恢复、会话、barge-in、确定性兜底、工具分发 |
| `renderer/voice-doubao.ts` | 660 | 豆包协议实现（VoiceProvider 接口的一个实现） |
| `renderer/voice-openai.ts` | 381 | OpenAI Realtime 实现（同一接口） |
| `renderer/sherpa-kws-engine.ts` | 512 | KWS 适配器（伪装成旧 openWakeWord 引擎的接口） |
| `renderer/voice-provider.ts` | 141 | **供应商中立的事件/接口契约** |
| `renderer/speaker-verify.ts` + worker | 394 | 遗留：WASM diarization 路径（已被原生取代） |
| `renderer/spoken-hide.ts` / `spoken-music.ts` | 43 / 35 | 纯函数：把"用户说了什么"翻译成意图 |
| `native/window-status.ps1` | 33 | user32 EnumWindows 判断桌面是否被其他窗口占用 |

**最值得学的一处抽象**：`voice-provider.ts` 定义了完全供应商中立的事件集（`transcript`/`tool.call`/`assistant.audio.started`…）和 `VoiceProvider` 接口，两个实现各自拥有自己的线上协议。注释里明确写了 Doubao 的三条不变式（只用 `/duplex/realtime/dialogue`、模型固定 `1.2.6.1`、认证用 `X-Api-Key`），以及"协议属于实现，这个文件只描述语义"。这是**接口稳定性**做得好的样板。

---

## 三、三条主链路

### 3.1 唤醒链路（最值得研究的一条）

```
麦克风（RAW，禁 AEC/NS/AGC）
  → ScriptProcessor 4096 帧
  → 需要时 48k→16k 降采样
  → 写入 4 秒环形缓冲 ring
  → 能量 VAD（阈值 0.008，静音 500ms）→ speech-start / speech-end
  → KWS 解码（zipformer transducer，ppinyin 关键词）
  → detect(keyword, score)
  → 120ms 仲裁窗（多个词模型同时命中时取最高分）
  → 热启动守卫 / 休眠后守卫 / 引擎未就绪守卫
  → 声纹验证（active 模式：不通过直接丢弃）
  → 边界分数需二次确认（< 0.48 时 6 秒内需再命中一次）
  → stopWakeWord() → 通知主进程装配 → startRealtimeSession()
```

**环形缓冲的价值**：KWS 一旦命中，缓冲里还留着刚才说唤醒词的那 4 秒原始音频，直接切出来送声纹验证。**不需要第二条采集路径**，也不需要"说完再录一次"。

**中文唤醒的关键参数**（`voice.ts:73-79`）：同一个「贾维斯」录了 **5 个声调变体**（jiǎ/iá/iā × wéi/wēi × sī/sí）映射到同一个 `@贾维斯` 标签。这是提升中文 KWS 召回最直接的手段。

**为什么必须 RAW 麦克风**：代码注释给了实测数据——Chromium 的 WebRTC 神经降噪会把短唤醒词的起始段和高频削掉，识别率掉到 **约 1/4**。同一结论在 `sherpa-kws-engine.ts` 和 `voice.ts` 各写了一遍。

### 3.2 对话链路

```
startRealtimeSession()
  → getUserMedia（对话链路反而开 AEC/NS/AGC，与唤醒相反）
  → muteRealtimeMicrophoneUntil(装配音效结束)
  → provider.sendAudio(microphone)
  → provider.establishSession(config)   ← config 由主进程下发
  → 豆包：AudioWorklet 重采样 float32 → 16000Hz PCM16，640 字节定长帧
  → 输出 24kHz PCM 分片 → 本地 AudioContext 队列调度播放
  → barge-in → 工具调用 → submitToolResult → requestResponse
```

**两套麦克风约束是刻意相反的**：
- 唤醒监听：RAW（要保真短词）
- 对话上云：开满处理（要人声）

**豆包输出音频的本地队列**是必要复杂度：Seeduplex 是全双工，音频以分片到达，客户端必须自己排队、按 `nextStartTime` 串行调度。代价是"打断时服务端已停，但客户端队列里还堆着几秒音频继续播"，所以中断时要**先清本地队列**（`clearChunkAudioQueue`）而不是等协议层。

### 3.3 渲染链路（app.ts）

- **装配动画**：CPU 端对 59994 个三角面做 **k-means 式空间聚类**成 63 个"零件"，每个零件算出`起始位置/外扩方向/弧线方向/旋转轴/延迟`六组顶点属性，再由 vertex shader 在 2.6 秒内插值回原位。40000 个粒子另走一套 additive shader。
- **全息 shader**：`onBeforeCompile` **链式注入**——先注装配（改 vertex），再注全息（改 fragment），两套效果共存。全息态改写到 `#include <opaque_fragment>` 之后（`gl_FragColor.a` 与 `discard`），装配改到 `#include <begin_vertex>`。
- **渲染节流**：idle 12fps / 普通 30fps / 全息 30fps / 装配·手势期间不限帧。窗口不可见时**完全停止 rAF**。
- **待机动作**只在 `isDocked` 时播（居中时静止）——用户角度看是"缩小后才有生命感"。
- 关键帧系统统一了三种动作源：`speech`（说话时随机小幅摆头）/ `command`（点头摇头转圈）/ `idle`（张望或慢转一圈）。

---

## 四、工程手法亮点（可借鉴）

这一节的每一条都是"踩过坑才写得出来"的东西。

### 4.1 长耗时调用一律加超时（贯穿全篇）

| 调用点 | 超时 | 不设超时的后果 |
|---|---|---|
| `getUserMedia` | 8s | 提示框挂住 → `wakeStartInProgress` 永久 true → 健康循环冻死 |
| `AudioContext.resume()` | 2s | Windows 音频设备卡死时永久挂起 → 健康循环停摆 |
| `AudioContext.close()` | 1s | `recoverWakeWord` 永久卡在 `running=true` |
| 豆包 WebSocket 建连 | 10s | 无限等待 |
| `session.created` 事件 | 10s | 会话建立无出口 |

代码里写得很直白：**"never await it without a timeout, or start() (and the health loop) wedges permanently"**。

### 4.2 三层失活检测 + 自恢复

`maintainWakeWordHealth()` 每 10 秒检查一次：
1. **AudioContext 状态**（suspended/interrupted → 先试 resume，失败则整条流重建）
2. **音频图存在性**（context 或 workletNode 或 track 丢失 → 重建）
3. **麦克风轨道健康**（readyState/enabled/muted → 重建）
4. **`frames === 0` 检测**：context 报告 running 但 10 秒内零帧回调 → 判定音频图卡死（Windows 设备切换后必现）
5. **定时硬刷新**：每 12 分钟无条件刷新一次，因为实测"闲置约 1 小时后麦克风/VAD 还活着但再没有关键词候选"

另有**事件驱动的即时检测**：`audio-lost`（context onstatechange + track.onended），不等 10 秒轮询。

### 4.3 「本地 + 服务端」两阶段打断

```
本地半：麦克风 RMS ≥ 0.08 持续 12 帧（约 200ms）→ 立刻静音播放
        ↑ 快，但只会听能量不会听语义（打字声也像）
服务端半：真正的权威判定，允许销毁（取消响应、清队列）
        ↑ 慢，但语义正确
若 1200ms 内服务端未确认 → 自动恢复播放（用户只感到一次短暂断续）
```
注释点明了本质：**用户感知的"它停了"是扬声器安静下来，这完全是本地的事；网络往返不该挡在用户和"安静"之间。**

且按供应商分叉：OpenAI（半双工）走本地 barge-in；豆包（原生全双工，模型边说边听）**禁用本地静音**，只清本地队列，不碰模型的轮次状态。

### 4.4 确定性兜底（`spokenCommandFallbacks`）—— 本项目最有价值的思想

**动机**：模型"答应了但不调工具"，用户**无法靠说话自救**（说话本身就是失效的那个环节）。

**原则**：只给"用户无法重试绕开"的命令加兜底，其余交给模型。
> "Both entries here are commands the user cannot retry their way out of... Everything else is left entirely to the model, because a wrong guess there is worse than a missed call."

**实现**：ASR 终稿到手 → 本地解析意图 → 启动计时器（各命令延迟不同，900–2500ms）→ 若模型在此期间调了对应工具则取消 → 否则本地注入一次工具调用。

**安全机制 = 整句匹配 + 长度上限**：
- 告别词：`keywords` + `maxLength: 6`（"这个功能怎么退出"7 字，挡住）
- 召唤词：`maxLength: 6`（"贾维斯是谁演的"7 字，挡住）
- 旋转/天气/全息/缩放各有自己的长度上限与 `excludeKeywords`

注释里有真实迭代记录：告别清单原本枚举整句，有"退下/结束"没有"退出"，一字之差就漏了；改成**短句内关键词**才稳定。召唤词原本也是枚举，"怎么看不到你"和"怎么没看到你"差一字就漏了。**结论：枚举整句必失败，长度为闸的关键词匹配才稳。**

**延迟是量出来的**：`play_music` 兜底从 1.0s 改成 1.45s，因为实测真实工具调用落在 ASR 终稿后 1.003–1.045s，1.0s 会撞车导致同一请求执行两遍。

### 4.5 不可逆操作要求"话语归属"校验

`quit_jarvis` 是唯一不可逆的操作，所以执行前检查**用户最后一句到底在说谁**：

```ts
const spokenAboutJarvis = /ashley|艾希莉|贾维斯|你自己|程序|完全退出/i.test(lastUserUtterance);
const spokenAboutAnotherApp = /观澜|抖音|微信|浏览器|音乐|窗口|网页/i.test(lastUserUtterance);
if (!spokenAboutJarvis || spokenAboutAnotherApp) → 拒绝并请用户说清楚
```
起因：用户说"你帮我把抖音关掉吧"，Seeduplex 路由到了 `quit_jarvis`，直接杀掉整个助手。同类防呆还有"关闭观澜"被纠正为 `close_application`。

### 4.6 日志即诊断

三个持久化诊断出口（都在 `userData/`）：
- `runtime.log` — 主进程全量日志
- `voice-events.json` — 最近 80 条语音事件
- `audio-diagnostics.json` — 最近 24 条音频传输质量（丢包率/jitter/隐藏样本数）

注释解释了为什么必须落盘："一个 35 秒的实时麦克风 + 沉默模型，正是因为缺这条记录而无法诊断"；以及**三种失败症状相同但修复完全不同**：
1. 音频从未到达服务端
2. ASR 听不出词
3. 模型听到了但选择不行动

对应记录：`User heard as: "..."`。另外"干净完成"也记日志——否则"没有记录"和"回合从未结束"无法区分。

### 4.7 视觉呈现的"首帧"防闪

`presentAssemblyWindow()` 要等渲染层确认**已经画出打散后的第一帧**才 `show()` 窗口，避免展示缓存里的完整头盔。有看门狗：1.5s 未确认 → 只重载视觉窗口一次；两次失败 → 放弃显示，但**语音保持在线**（"keeping the desktop clear while voice remains online"）。

### 4.8 环境配置的"所有权"划分

`environment.ts` 把配置分两类：
- **凭据**（API key）→ 走 Node 正常优先级，允许被外部覆盖
- **app 自有选择**（`JARVIS_VOICE_PROVIDER`/`DOUBAO_VOICE`/兜底开关/额外唤醒模型）→ **从项目 .env 重新读取并钉死**

起因：某次启动从父进程继承了 `JARVIS_VOICE_PROVIDER=openai`，而项目 .env 写的是 doubao，`process.loadEnvFile` 不覆盖继承值 → 那一次启动**静默换了模型和音色**。

---

## 五、技术债与遗留（诚实清单）

这个项目**迁移不彻底**，遗留清晰可见：

### 5.1 平台残留：工具描述还在告诉模型"你在 Mac 上"

模型收到的工具描述里明知 Windows 不可用却仍然下发：

| 工具 | 现状 |
|---|---|
| `search_maps` | 描述"使用 Apple 地图" → 执行时 `throw '在 Windows 上暂不支持'` |
| `get_directions` | 同上 |
| `play_music` / `control_music` | 描述完整 → 执行时 throw（但 `voice.ts` 兜底清单里还留着 play_music 条目！） |
| `switch_desktop` | 描述"切换 macOS 桌面（Spaces）" → throw（兜底清单同样留着） |
| `open_application` | 描述"打开 macOS 应用" |
| `get_current_time` | 返回字符串"当前 **Mac** 系统时间" |
| system prompt | "你是运行在用户 **Mac** 上的 Ashley 语音入口" |

**后果是实际的**：这些描述会进入模型的上下文，模型可能反复尝试调用然后拿到错误。而 `voice.ts` 的确定性兜底清单**也还挂着 play_music / switch_desktop 的匹配**——用户说"切个桌面"会被本地兜底调用一个必然 throw 的工具。这是**双份不一致**。

### 5.2 openWakeWord 已退役但脚手架未拆

- `package.json` 仍有 `openwakeword-wasm-browser` 依赖
- `scripts/copy-resources.cjs` 仍从该包复制 `melspectrogram.onnx`/`embedding_model.onnx`/`silero_vad.onnx`/`hey_jarvis_v0.1.onnx` 到 `dist/assets/wake-word/models/`
- `patches/openwakeword-wasm-browser@0.1.1.patch` 仍在
- `src/renderer/openwakeword-wasm-browser.d.ts` 类型声明仍在
- `speaker-verify.ts` + `speaker-verify-worker.js`（WASM diarization 路径）仍在，注释自己写明"已被原生取代"
- 运行时实际用的是 `assets/wake-word/kws-wasm/`（sherpa）

而 `assets/wake-word/models/` 里却**存在** `hey_jarvis_community_20260503.onnx` / `_20260625.onnx`——这两个是改造者自己弄来对比的社区模型。

### 5.3 死文件与冗余资源

| 项 | 说明 |
|---|---|
| `src/renderer/index.html` | **无人加载**（main.ts 只 load `effects.html` / `voice.html` / `wake-enrollment.html`）；grep 全仓无引用 |
| `assets/helmet/model.original.glb` | 75.9 MB，仅被 `copy-resources.cjs` 的 filter 显式排除 |
| `assets/helmet/model-source.glb` | 42.3 MB |
| 两者合计 | **约 118 MB** 源模型占仓库空间（`model.glb` 实际只用 1.9 MB） |
| `dist/` | 已提交的构建产物（app.js 1.4 MB、sherpa wasm/data 共 25 MB） |

### 5.4 其他

- `main.ts:865` 的时间格式用了 `Intl.DateTimeFormat('zh-CN')`，但值前文案是"当前 Mac 系统时间"
- `app.ts` 里大量注释仍在讲 macOS 合成器行为（"macOS can present either a blank or cached full head"），在 Windows 上语义已变但逻辑保留
- `wakeEnrollmentWindow` 的 `wake-enrollment.html` 写死"0 / 12"，而 `voice.ts` 里 `personalWakeEnrollmentSamples = 5`——**UI 文案与实际采集条数不一致**（HTML 是改造前的遗留，`wake-enrollment.ts` 只有 27 行）
- sherpa KWS 的 `getKeywordEmbeddingSnapshot` 返回 `FAKE_SNAPSHOT`（全 0.1 的假 96 维向量），只为骗过 voice.ts 的"嵌入窗口必须完整"闸门——**两个引擎的接口适配残留**

---

## 六、对阿罗德斯的借鉴判断

### 6.1 直接可用（建议吸收）

| 借鉴点 | 为什么对阿罗德斯有用 |
|---|---|
| **唤醒链路的超时纪律** | 与阿罗德斯 §8 红线第 5 条（长耗时请求必须有超时，否则闩锁静默停摆）**完全同源**，但这个项目把它系统化到了每一处 await。阿罗德斯目前只有 `fetchWithTimeout` + vision 一处，可对照补全 |
| **三层失活检测 + 定时硬刷新** | 阿罗德斯"屏幕观察静默停摆"的诊断出口是 `[diag:vision-tick]`，但**缺自恢复**——Ashley 的 `maintainWakeWordHealth`（状态检查/存在性检查/轨道检查/零帧检查/12分钟硬刷新 + 事件驱动即时检测）是可以直接照搬的结构 |
| **确定性兜底 + 长度闸** | 阿罗德斯的红线是"渲染到屏幕的文案不得含证据字面量"——**同一类思想**：不信任单一通道的可靠性，关键判断走确定性路径。Ashley 的"短句关键词 + maxLength 上限"是比枚举整句更稳的实现，阿罗德斯若做语音指令必踩同样的坑 |
| **不可逆操作的归属校验** | "关闭某应用"被误路由成"关闭自己"的教训，对阿罗德斯任何破坏性操作（删除记忆、终止任务）都成立 |
| **日志即诊断 / 三种同症状失败的区分** | 阿罗德斯有 `desktop.log` + `[diag:vision-tick]`，但缺少"把用户实际说的话记下来"这类关键中间量。Ashley 的 `User heard as: "..."` 是低成本高回报 |
| **两阶段打断（本地快而蠢 + 服务端慢而准，超时自动回滚）** | 若阿罗德斯要做语音交互，这是延迟与正确性的标准解法 |
| **RAW 麦克风约束** | 若阿罗德斯上 KWS：WebRTC 降噪会把短词识别率打到 1/4，必须显式关闭 |
| **声纹验证做"只有主人能唤醒"** | 512 维 ERes2Net 原生 embedding + 余弦相似度阈值 0.5，延迟 35ms，样本 5 条 × 0.3–2.0s，模型只存本地 `userData`。**这套成熟度和成本都很合适** |
| **配置所有权划分（凭据 vs app 自有选择）** | 阿罗德斯的 dotenv 优先级问题（用户级 `.env` 优先）已踩过坑，这个"把非密选择重新钉死"的手法可以借鉴 |

### 6.2 参考但不必照搬

- **双窗口（视觉 / 语音核）**：阿罗德斯已是"管家窗口 + 桌宠窗口"，结构类似；但 Ashley 的"语音核 1×1 隐藏窗口"是**把 Web 当无头后台用**。阿罗德斯有独立 Node 后端（3003），语音/监听更适合放后端，不必模仿这个 Web 无头窗口。
- **Docked 缩小常驻**：Ashley 用 220px 常驻表达"我在但让开"。阿罗德斯的产品定位是"管家陪伴"，桌宠尺寸**用户明确要求不要自动改**（红线 §8.7），**不要照搬**。
- **供应商中立 VoiceProvider 接口**：思想好（阿罗德斯已有 `ExecutionRequest/ExecutionResult` 执行器协议的同类设计），但 Ashley 的两个实现共享了 90% 的 `voice.ts` 分支判断（`provider.name === 'doubao'` 散布各处），**抽象泄漏了**。阿罗德斯若做多执行器，注意别重演。
- **19 个工具全量下发**：Ashley 把 Windows 不可用的工具也下发给模型，只靠执行时 throw。**分布式删除**在工具上是更好的选择——不用的工具不该出现在 prompt 里。

### 6.3 明确不可借鉴

- **不做项目 / 编码能力**：Ashley 有 19 个工具、能开关应用、有编程级 shader 注入——**正是阿罗德斯明确不要的方向**（"它不需要编码能力、不做项目"）。
- **不做全能智能体**：Ashley 的复杂度（9975 行、三层诊断、五状态可见性机）服务于"一个很酷的演示"。阿罗德斯的目标是"一个管家 + 一个执行器"，**方向是做减法**。学它的**失败处理纪律**，不要学它的**功能广度**。

---

## 七、关键参数速查

| 参数 | 值 | 出处 |
|---|---|---|
| KWS 阈值 / 加分 | `keywordsThreshold: 0.25` / `keywordsScore: 1.5` | voice-config.ts |
| KWS 冷却 | 2000ms | voice.ts |
| 唤醒来电增益 | 1.5 | voice-config.ts |
| 热启动守卫 | 1000ms | voice.ts |
| 引擎硬刷新 | 12 分钟 | voice.ts |
| 健康检查周期 | 10s | voice.ts |
| 边界分数即时唤醒线 | 0.48（低于则需 6s 内二次确认） | voice.ts |
| 多头仲裁窗 | 120ms | voice.ts |
| 声纹阈值 | 余弦 0.5 | personal-wake.ts |
| 声纹样本 | 5 条，0.3–2.0s，16kHz | personal-wake.ts |
| 唤醒 VAD | 能量 0.008 / 静音 500ms | sherpa-kws-engine.ts |
| 本地打断阈值 | RMS 0.08 × 12 帧 / 确认超时 1200ms | voice.ts |
| 装配时长 / 零件数 / 粒子数 | 2600ms / 63 / 40000 | model-config.ts |
| 头盔尺寸 | 居中 960px / docked 220px / 边距 24px | main.ts |
| 全息 | 12s、升起 1600ms、自动间隔 60s、青色 `0x35e0ff` | model-config.ts |
| 模型 | 59994 面，1.9 MB，`model.glb` | assets/helmet |
| 渲染帧率 | idle 12 / 普通 30 / 全息 30 / 动画中不限 | app.ts |
| 豆包 | 模型 `1.2.6.1`、上行 16k PCM 640B 帧、下行 24k、`end_smooth_window_ms: 600` | voice-doubao.ts |
| OpenAI | `gpt-realtime-2.1-mini`、`max_output_tokens 4000`、`server_vad` 0.52/360ms、`playoutDelay 0.42s` | main.ts / voice.ts |

---

## 八、一句话总结

**它的工程价值集中在"失败处理"上，不在功能上。** 近一万行代码里，最有分量的不是 3D 装配或全双工语音，而是：**每个 await 都假设对方可能永远不返回；每个"模型应该会调工具"的地方都准备了确定性兜底；每个静默失效都留了可落盘的中间量。** 而它的技术债集中在"迁移停在了一半"——macOS 和 openWakeWord 的残留在 prompt 和依赖里都还活着，这些残留会**实际影响运行时行为**（模型被告知自己运行在 Mac 上）。

对阿罗德斯：**抄它的纪律，别抄它的体量。**
