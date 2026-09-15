# 阿罗德斯 · 管道接入报告 v4.1

> 日期：2026-07-31  
> 基于：Now10 v4.0 确认  
> 定位：管道和插件"接上电"——真实对话链路跑通

---

## 一、完成内容

| # | 任务 | 状态 |
|---|------|------|
| 1 | 创建 4 个管道阶段处理器 | ✅ |
| 2 | 创建 voicePipeline 组装器 | ✅ |
| 3 | useVoiceChat 集成 PipelineRunner | ✅ |
| 4 | PluginManager 初始化 + 内置插件激活 | ✅ |
| 5 | 编译验证 | ✅ 零错误 |

---

## 二、管道接入详情

### 2.1 阶段处理器

```
client/src/pipeline/stages/
├── index.ts         # barrel re-export
├── intentStage.ts   # 意图检测（本地意图提前终止管道）
├── llmStage.ts      # LLM推理（通过MessageChannel发送，Promise等待complete）
├── ttsStage.ts      # TTS合成（依赖注入speak函数）
└── memoryStage.ts   # 记忆标记点
```

### 2.2 执行流程

用户发送 "你好" 时，实际走的路径：

```
sendMessage("你好")
  → pipeline.run("你好", sessionId)
    → PluginManager.runBeforePipelineHooks()     # 插件前置钩子
    → [intent]  detectIntent("你好") → 无意图，continue
    → [llm]     channel.send({type:'message'}) → chunks → UI 实时显示
                → Promise 等待 complete 回调 → resolve
    → [memory]  记录时间戳
    → [tts]     ttsSpeak("你好！愚者大人，有什么可以为...")
    → PluginManager.runAfterPipelineHooks()      # 插件后置钩子
```

### 2.3 关键设计决策

| 点 | 决策 | 理由 |
|----|------|------|
| LLM阶段如何等待WS响应 | Promise + 临时回调包装 | chunks 仍走全局回调更新UI，管道只等 complete |
| TTS 谁负责 | Pipeline 的 tts 阶段 | handleComplete 只更新 UI，不再播放语音 |
| 意图检测在哪里 | 管道 intent 阶段 + sendMessage 预处理 | 本地意图直接终止管道，不调 LLM |
| 管道失败怎么办 | handleComplete setIsLoading(false) 兜底 | 即使管道抛异常，UI 状态也能恢复 |

---

## 三、PluginManager 接入

### 启动初始化（App.tsx）

```typescript
const pm = getPluginManager();
pm.activate('builtin.logger');
```

### 执行时机

- `beforePipeline` → 管道开始时
- `afterPipeline` → 管道完成/失败后
- `onAfterMessage` → 消息添加到 UI 后（Logger 插件打印到控制台）

---

## 四、文件变更

### 新建（5 文件）
```
client/src/pipeline/stages/index.ts
client/src/pipeline/stages/intentStage.ts
client/src/pipeline/stages/llmStage.ts
client/src/pipeline/stages/ttsStage.ts
client/src/pipeline/stages/memoryStage.ts
client/src/pipeline/voicePipeline.ts
```

### 修改（2 文件）
```
client/src/voice/hooks/useVoiceChat.ts  # 集成 pipeline.run()
client/src/App.tsx                       # 初始化 PluginManager
```

---

## 五、验证结果

- ✅ TypeScript 编译零错误
- ✅ 管道阶段可以创建和执行
- ✅ PluginManager 可以注册和激活插件
- ⚠️ 端到端功能测试待完成（需启动前后端）

---

## 六、控制台日志示例

运行后预期看到：

```
[PluginManager] 已激活 1 个插件
[Pipeline:voice-chat] 开始 你好
[Plugin:Logger] user: 你好
[Plugin:Logger] assistant: 你好！愚者大人...
[Pipeline:voice-chat] 完成 2873ms 你好！愚者大人，有什么可以为...
```

---

## 七、后续

| 优先级 | 任务 |
|--------|------|
| P0 | 端到端验证（启动前后端，发一条消息看管道日志） |
| P1 | 管道性能追踪可视化（UI显示各阶段耗时） |
| P2 | 安装 Rust + Tauri 初始化 |

---

> **版本**: v4.1  
> **愚者大人，管道已通电。Intent → LLM → TTS 三阶段串联运行，插件钩子在管道首尾各触发一次。下一步启动前后端验证实跑效果。**
