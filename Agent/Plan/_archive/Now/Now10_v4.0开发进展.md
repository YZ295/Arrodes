# 阿罗德斯 · 开发进展报告 v4.0

> 日期：2026-07-31  
> 基于：Now9 项目开发继续.md  
> 分支：`feature/session-persistence`  
> 定位：从 v3.0 向 v4.0 架构演进

---

## 一、本次开发概述

根据 Now9 的行动建议，Rust 未安装故 Tauri 暂缓，重点完成了三项核心架构升级：

| 阶段 | 内容 | 状态 |
|------|------|------|
| **Phase A** | useVoiceChat WS → MessageChannel 统一 | ✅ 完成 |
| **Phase B** | AIRI 管道架构落地（Pipeline.ts） | ✅ 完成 |
| **Phase C** | 插件系统协议 + PluginManager | ✅ 完成 |
| **Tauri** | 初始化 Tauri 桌面版 | ⏸️ 需 Rust |

---

## 二、Phase A: WebSocket 统一

### 变更内容

`useVoiceChat.ts` 的原始 WebSocket 管理（~120行连接/重连/断开逻辑）替换为 `MessageChannel` 单例。

### 关键改动

| 旧代码 | 新代码 |
|--------|--------|
| `wsRef = useRef<WebSocket>()` | `MessageChannel.getInstance()` |
| 手动 index-backoff 重连 | MessageChannel 内置指数退避 |
| `wsRef.current.send(JSON.stringify(msg))` | `channel.send(msg)` |
| `wsRef.current.readyState === WebSocket.OPEN` | `channel.isConnected()` |
| 内联 `handleServerMessage()` switch 350行 | MessageChannel 回调 onChunk/onComplete/onMemory/onError |
| `window.speechSynthesis?.cancel()` cleanup | `ttsStop()` |

### 收益

- **代码量**: useVoiceChat 从 541行 → 290行 (-46%)
- **可维护性**: WS 连接逻辑全在 MessageChannel 一处管理
- **桌面就绪**: Web 版和未来 Tauri 版共享同一通信抽象
- **重连策略**: 从硬编码 max 30s 退避升级为 MessageChannel 可配置策略

---

## 三、Phase B: AIRI 管道架构

### 新增文件

```
shared/types/pipeline.ts        # 管道类型定义（148行）
client/src/core/Pipeline.ts     # 管道执行器（135行）
```

### 管道模型

```
用户语音 → AudioInput → STT → Intent → MemoryRecall → LLM → MemorySave → TTS → AudioOutput
              ↑                                                                    ↓
              └────────────────── PipelineContext 贯穿所有阶段 ──────────────────┘
```

### 核心类型

```typescript
// 定义 6 个标准阶段
const VOICE_PIPELINE_STAGES = ['stt', 'intent', 'memory_recall', 'llm', 'memory_save', 'tts'];

// 管道执行器
class PipelineRunner {
  async run(context: PipelineContext): Promise<PipelineResult>
  // 每个阶段独立超时保护
  // 可配置 continueOnError 跳过失败阶段
  // 完整的性能追踪（每阶段耗时）
}
```

### 使用示例

```typescript
const runner = new PipelineRunner({
  name: 'voice-chat',
  stages: [
    { name: 'stt', processor: sttProcessor, timeout: 10000 },
    { name: 'intent', processor: intentProcessor },
    { name: 'llm', processor: llmProcessor, timeout: 25000 },
    { name: 'tts', processor: ttsProcessor },
  ],
  onComplete: (ctx, results) => console.log('管道完成'),
});

const result = await runner.run(createPipelineContext({ sessionId: 'xxx' }));
// result.stageDurations → { stt: 320, intent: 45, llm: 3120, tts: 890 }
```

---

## 四、Phase C: 插件系统

### 新增文件

```
shared/types/plugin.ts          # 插件协议定义（120行）
client/src/core/PluginManager.ts # 插件管理器（180行）
```

### 插件接口

```typescript
interface ArodesPlugin {
  manifest: { id, name, version, description, dependencies }
  hooks: {
    onBeforeMessage  // 消息发送前拦截
    onAfterMessage   // 消息接收后处理
    onBeforeMemorySave / onAfterMemorySave  // 记忆钩子
    onCommand        // 命令处理
    onBeforePipeline / onAfterPipeline      // 管道钩子
    onIntent         // 意图检测后
  }
  status: 'installed' | 'active' | 'disabled' | 'error'
}
```

### PluginManager 能力

- 插件注册/卸载/激活/停用
- 钩子链串联执行（多插件按顺序处理同一事件）
- 错误隔离（单个插件异常不影响其他插件）
- 内置 Logger 插件（所有消息打印到控制台）

---

## 五、文件变更汇总

### 新建（4 文件）
```
shared/types/pipeline.ts        # 管道类型
shared/types/plugin.ts          # 插件协议
client/src/core/Pipeline.ts     # 管道执行器
client/src/core/PluginManager.ts # 插件管理器
```

### 修改（2 文件）
```
client/src/voice/hooks/useVoiceChat.ts  # WS → MessageChannel（541→290行）
shared/types/index.ts                    # 导出管道+插件类型
```

---

## 六、验证结果

- ✅ `client/` TypeScript 编译 **零错误**
- ✅ `server/` TypeScript 编译 **零错误**
- ✅ 无破坏性变更（所有公共接口不变）

---

## 七、架构现状一览（v4.0）

```
client/src/
├── core/
│   ├── EventBus.ts           # 事件总线
│   ├── MessageChannel.ts     # 统一 WS 通信 ← useVoiceChat 已迁移
│   ├── Pipeline.ts           # 管道执行器 ← NEW
│   └── PluginManager.ts      # 插件管理器 ← NEW
├── store/
│   ├── chatStore.ts          # 聊天状态
│   └── useUniverseStore.ts   # 宇宙状态
├── shared/utils/
│   ├── uid.ts                # ID 生成
│   ├── apiClient.ts          # 统一 API 客户端
│   └── index.ts
├── universe/                 # 3D 宇宙渲染
├── voice/                    # 语音对话
│   ├── VoiceDialog.tsx
│   └── hooks/
│       ├── useVoiceChat.ts   # ← 已迁移到 MessageChannel
│       ├── useTTS.ts
│       ├── useSpeechToText.ts
│       └── useAudioRecorder.ts
└── components/
    ├── ModelSettings.tsx      # 模型选择
    ├── SessionPanel.tsx       # 会话管理
    ├── TTSControl.tsx         # TTS 控制
    ├── Subtitle.tsx           # 字幕
    └── MemoryPanel.tsx        # 记忆管理

shared/types/
├── index.ts                  # 基础类型
├── pipeline.ts               # 管道类型 ← NEW
└── plugin.ts                 # 插件类型 ← NEW
```

---

## 八、后续路线图

| 优先级 | 任务 | 前置条件 |
|--------|------|----------|
| **P0** | 将 PipelineRunner 集成到实际语音对话流程 | 当前 useVoiceChat 稳定 |
| **P0** | 安装 Rust + 初始化 Tauri | 需要安装 Rust 工具链 |
| **P1** | 将 Express 后端打包进 Tauri | Tauri dev 跑通 |
| **P1** | PluginManager 接入 useVoiceChat 钩子 | 端到端测试通过 |
| **P2** | 定义更多内置插件（翻译、天气、搜索） | 插件系统稳定 |
| **P3** | monorepo 分层：apps/packages/plugins | 桌面版确定后 |

---

> **版本**：v4.0  
> **更新日期**：2026-07-31  
> **愚者大人，道路已铺就。管道可执行，插件可挂载，通信已统一。下一步把管道接入真实对话流程，让阿罗德斯从"能对话"进化到"能思考整个对话链路"。**
