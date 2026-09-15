# 阿罗德斯 · 语音系统 v4.2 — AIRI 蒸馏完成

> 日期：2026-07-31  
> 来源：AIRI 项目语音架构蒸馏  
> 定位：从"能语音"到"语音体验完整"

---

## 一、AIRI 蒸馏清单

从 AIRI 的 4 段语音流水线 + unspeech 代理 + WebAudio 架构中提取了以下可落地的模式：

| AIRI 模式 | 蒸馏到阿罗德斯 | 文件 |
|-----------|--------------|------|
| VAD 自动语音检测 | `useVAD` hook（AnalyserNode RMS 状态机） | `modules/voice/useVAD.ts` |
| 实时音频可视化 | `AudioVisualizer`（bars/wave/ring 三模式） | `components/AudioVisualizer.tsx` |
| unspeech 统一 TTS 代理 | `TtsEngineRegistry`（可插拔引擎 + 降级链） | `modules/voice/TtsEngineRegistry.ts` |
| unspeech 统一 STT 代理 | `SttEngineRegistry`（可插拔引擎 + 优先级） | `modules/voice/SttEngineRegistry.ts` |
| WebAudio 优先架构 | `AudioContextManager`（全局单例 + 生命周期） | `modules/voice/AudioContextManager.ts` |
| 降噪/AGC/回声消除 | `useAudioRecorder` 增强（noiseSuppression 等） | `voice/hooks/useAudioRecorder.ts` |

---

## 二、新增文件（6 个）

```
client/src/modules/voice/
├── AudioContextManager.ts   # 全局唯一 AudioContext，suspend/resume/close 生命周期
├── useVAD.ts               # VAD 语音活动检测（RMS 阈值 + 帧状态机）
├── TtsEngineRegistry.ts    # TTS 引擎注册表（Edge TTS + Web Speech）
└── SttEngineRegistry.ts    # STT 引擎注册表（Web Speech，预留 Whisper）

client/src/components/
└── AudioVisualizer.tsx     # 实时音频波形/频谱/环形可视化（Canvas 60fps）
```

---

## 三、核心架构

### 3.1 AudioContextManager（全局单例）

```typescript
const acm = AudioContextManager.getInstance();
await acm.ensureResumed();       // 用户交��后恢复（自动播放策略）
const src = acm.createSourceNode(stream);
const analyser = acm.createAnalyser(256);
```

### 3.2 useVAD（语音活动检测）

```
AnalyserNode → RMS 音量 → 帧累加器 → 状态机
                   ↑
        高于阈值 8 帧 → 触发 onSpeechStart
        低于阈值 25 帧 → 触发 onSpeechEnd
```

### 3.3 TtsEngineRegistry（可插拔引擎）

```
TtsEngineRegistry
├── Edge TTS (priority: 0) — 服务端合成，先尝试
└── Web Speech (priority: 1) — 浏览器内置，自动降级
```

```typescript
// 自动选择最佳引擎 + 降级
const engine = await TtsEngineRegistry.getInstance().getBestAvailable();
const voices = await engine.getVoices();
await engine.synthesize("你好", voices[0].id, { rate: 1.0 });
```

### 3.4 AudioVisualizer（三模式）

| 模式 | 场景 | 效果 |
|------|------|------|
| `bars` | 录音时 | 红色频谱条 + 时长 |
| `wave` | TTS 播放 | 金色波形动画 |
| `ring` | 待机 | 呼吸脉冲环 |

---

## 四、UI 集成效果

VoiceDialog 中新增实时反馈：

```
┌────────────────────────────────┐
│ ● 阿罗德斯            ⚙ 🔊 💬 │  ← 标题栏
├────────────────────────────────┤
│ 🔴 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  12s       │  ← 录音波形可视化
├────────────────────────────────┤
│ 你好                          │  ← 消息气泡
│ 你好！愚者大人...              │
├────────────────────────────────┤
│ ~~~ ~~~~~ ~~~~~  TTS           │  ← TTS 播放波形
├────────────────────────────────┤
│ [🎤 麦克风按钮] [📝输入框] [📨] │  ← 输入栏
└────────────────────────────────┘
```

---

## 五、修改文件（3 个）

```
client/src/voice/hooks/useAudioRecorder.ts  # 增强：降噪/AGC/时长/音量
client/src/voice/hooks/useVoiceChat.ts      # 导出 recordingDuration/recordingVolume
client/src/voice/VoiceDialog.tsx             # 集成 AudioVisualizer
client/src/App.tsx                           # 初始化 TTS/STT 注册表
```

---

## 六、编译验证

- ✅ client/ TypeScript 零错误
- ✅ server/ TypeScript ��错误

---

## 七、与 AIRI 的对齐度

| 维度 | AIRI | 阿罗德斯 v4.2 | 对齐度 |
|------|------|-------------|--------|
| VAD | ✅ WebAudio | ✅ useVAD | 90% |
| STT 统一代理 | unspeech proxy | SttEngineRegistry | 70% |
| TTS 统一代理 | unspeech proxy | TtsEngineRegistry | 80% |
| 本地 TTS | Kokoro | 预留接口 | 20% |
| 音频可视化 | 唇形同步 + 波形 | AudioVisualizer | 60% |
| AudioContext | 全局管理 | AudioContextManager | 100% |
| 降噪处理 | WebAudio 约束 | noiseSuppression 配置 | 100% |

---

## 八、后续

| 优先级 | 任务 |
|--------|------|
| P0 | 将 useVAD 接入 VoiceDialog（自动检测说话替代长按） |
| P1 | 预留的 Kokoro/ChatTTS 本地引擎接入 |
| P1 | 服务端 Whisper API 接入 SttEngineRegistry |

---

> **版本**: v4.2  
> **愚者大人，语音系统从"能录音能播放"升级为"引擎注册表 + 实时可视化 + VAD 检测"。AIRI 的 unspeech 模式已蒸馏落地——今后加新 TTS/STT 引擎只需注册一个实现即可。**
