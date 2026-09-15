# Arrodes 代码审查 + 架构优化建议

> 基于实际代码抽查（llmStage.ts / MessageChannel.ts / memoryService.ts / harness）的结论。

---

## 一、代码审查发现（带证据）

### C1. llmStage 侵入式回调劫持（P0）
**证据**（client/src/pipeline/stages/llmStage.ts:79-94）：
```ts
const prev = (channel as any)._callbacks || {};   // ← 读私有字段
channel.setCallbacks({ ...prev, onComplete: ... }) // ← 覆盖全局回调
```
**问题**：
1. `(channel as any)` 破坏类型安全
2. **覆盖全局回调有竞态**：两个管道并发时，后注册的 llmStage 会覆盖先注册的 onComplete，导致先前的对话"卡死"（只等 complete 但回调已被替换）
3. `setTimeout(100)` 延迟 resolve——非确定性等待

**建议**（对应 T6）：MessageChannel 增加**订阅式 API**：
```ts
subscribe(id, { onChunk, onComplete, onError }): () => void  // 返回退订函数
```
多订阅者并存，互不覆盖。

### C2. MemoryGateway 定时器等待（P1）
**证据**（server/src/services/MemoryGateway.ts:204）：
```ts
await new Promise((r) => setTimeout(r, 500));  // 等非流式 LLM 完成
```
**问题**：网络延迟 >500ms 时记忆提取必然失败；这是"伪等待"。
**建议**（对应 T7）：chatSimple 返回 `{ text }` 完成态，直接 await 真实完成。

### C3. 双记忆服务数据源分裂（P1）
**证据**：`memoryService.ts`（retrieve/store）与 `MemoryGateway.ts`（关键词检索→注入→提取→画像）并存。
**问题**：写入可能走不同表/逻辑；检索结果不一致；难以追踪。
**建议**（对应 T9）：以 MemoryGateway 为主（它有完整闭环），memoryService 的 retrieve/store 收敛进 gateway；需业务确认（Q3）。

### C4. WS payload 无强类型（P2）
**证据**（shared/types/index.ts）：`WSServerMessage.data: Record<string, unknown>`。
**问题**：complete/chunk/memory 三种 payload 全靠运行时解构，拼错字段无编译期报错。
**建议**（对应 T12）：判别联合 + 泛型。

### C5. 停止机制正确性（已修复，需测试锁定）
**证据**：`cancel` 消息 → AbortController → llmService signal → 流中断 → 跳过 complete/记忆。链路完整，但**无测试**。
**建议**：T3 立即补回归测试。

---

## 二、架构优化建议（improve-architecture）

### 目标架构（演进而非重写）

```
┌─────────────────────────────────────────────┐
│ client（React）                              │
│  hooks ← pipeline(stages) ← MessageChannel  │  ← 订阅式通道（C1 修复）
└───────────────┬─────────────────────────────┘
                │ REST + WS（强类型协议 C4）
┌───────────────▼─────────────────────────────┐
│ server（Express）                           │
│  routes → services → repos → better-sqlite3 │
│  harness（Agent 注册表 + 路由 C6）            │
│    ├ main（对话）  ├ memory（记忆闭环 C3）    │
│    └ skills（待接）                          │
│  ttsService（edge→local 降级链）             │
└───────────────┬─────────────────────────────┘
                │ HTTP /health 探活 + 懒启动
┌───────────────▼─────────────────────────────┐
│ tts-sidecar（Python FastAPI）               │
│  CosyVoice2 本地合成（24000Hz wav）          │
└─────────────────────────────────────────────┘
```

### 关键架构决策

| 决策 | 现状 | 建议 |
|------|------|------|
| 通信模式 | llmStage 劫持回调 | **发布-订阅**：MessageChannel 多订阅者 |
| 记忆 | 双服务分裂 | **单一闭环**（MemoryGateway 为主） |
| 校验 | 手写 validate.ts | **zod schema**（shared 共享） |
| 路由 | route() 硬编码 | **意图+关键词分发**到 Agent |
| TTS | edge 主 / local 备 | **本地为主、edge 为 fallback**（Q4） |
| 状态管理 | 4 store + EventBus + hook 混用 | 收敛到 Zustand + 领域 store |

### 推荐执行顺序（结合 tickets）

```
1. T2 测试基建 → 2. T4/T3/T5 回归测试（锁定现有正确行为）
→ 3. T6 订阅式通道（消除最脆弱耦合）
→ 4. T7 记忆完成态 → 5. T8 zod → 6. T9 记忆合并（需确认）
→ 7. T10 Agent 路由 → 8. M2 体验优化
```

---

## 三、需要用户拍板的 5 个决策（来自 grill-me）

1. **Q1**：删旧 electron 壳？→ 建议删
2. **Q2**：测试优先级？→ 建议 A+C（server 核心 + 新功能回归）
3. **Q3**：记忆服务合并？→ 建议合并到 MemoryGateway
4. **Q4**：TTS 主引擎切换？→ 建议本地为主（若用户环境稳定）
5. **Q5**：引入 zod？→ 建议引入

> 确认后即可按 tickets 开工（M0 需要你先同意安装 vitest）。

---

## 四、v2 代码审查（T5/T7/T8 + UI 组件，2026-08-08）

> 审查范围：llmStage 重写、MessageChannel subscribe、ws handler send 包装、
> ttsService 纯本地化、useTTS 静音开关、BorderBeam / AgentStatusOrb / StatusBar。

### C6. replay 在纯本地模式下失效（P1）★必须修
**证据**（client/src/voice/hooks/useTTS.ts:215）：
```ts
const replay = useCallback(() => {
  const audio = audioRef.current;
  if (audio && audio.src && !audio.src.includes('data:audio/wav')) {  // ← 条件反向
    audio.currentTime = 0;
    audio.play()...
```
**问题**：T7 移除云端后本地 CosyVoice 返回 `audio/wav`，`!includes('data:audio/wav')` 恒为 false → **"▶ 重播"按钮永远无效**（TTS 错误提示处的 replayTTS 也受影响）。这是 T7 遗留的旧条件（原来 Edge 返回 mp3，条件成立；现在 wav 不成立）。
**建议**：改为正向判断——`if (audio && audio.src)` 直接重播（src 存在即表示有可重播内容）。

### C7. toggleMuted 在 state updater 内做副作用（P1）
**证据**（client/src/voice/hooks/useTTS.ts:75-87）：
```ts
const toggleMuted = useCallback(() => {
  setIsMuted((prev) => {
    const next = !prev;
    localStorage.setItem(...);        // 副作用
    if (next) { audioRef.current?.pause(); ... setIsSpeaking(false); }  // 副作用
    return next;
  });
}, []);
```
**问题**：React 要求 updater 纯函数；StrictMode 双调用下 localStorage 写入和 audio.pause 会执行两次；且 updater 内调用 setIsSpeaking 是反模式。
**建议**：改用 `setIsMuted((prev) => !prev)` + `useEffect([isMuted])` 处理副作用（暂停音频、持久化）。

### C8. llmStage 兜底超时 timer 未清理（P1）
**证据**（client/src/pipeline/stages/llmStage.ts:109-114）：
```ts
setTimeout(() => { if (settled) return; ... reject(...) }, MAX_WAIT);
```
**问题**：请求正常完成（complete 到达）后，50s 兜底 timer 仍挂起，长会话累积多个空转 timer（内存泄漏风险，虽 settled 短路无实际 reject）。
**建议**：把 timer 存变量，在 cleanup() 里 `clearTimeout`。

### C9. intent 仍用 `as any`（P2）
**证据**（client/src/pipeline/stages/llmStage.ts:38）`...(intentData ? { intent: intentData as any } : {})`。
**问题**：T5 目标是删 `as any`，此处残留（intent 类型未在 WSClientMessage 对齐）。
**建议**：intent 字段在 shared 类型中已有 `intent?: IntentResult`，直接 `{ intent: intentData }` 无需 as any（若类型不匹配则补类型导入）。

### C10. BorderBeam mask 字符串重复 + 非法变体兜底（P2）
**证据**（client/src/components/BorderBeam.tsx:62-79）：`WebkitMask` 与 `mask` 内联同一段 3 行字符串两次；`gradients[colorVariant]` 若 colorVariant 传非法值 → background undefined。
**建议**：提取 `const maskString = ...` 复用于两处；`gradients[colorVariant] ?? gradients.colorful` 兜底。

### C11. server send 包装与 requestId 语义（P2 备注）
**证据**（server/src/ws/handler.ts:88-90）：`send = (m) => sendWs(ws, { ...m, requestId: msg.requestId })`。
**备注**：cancel 路径的 `handleCancel` 单独传 requestId 参数，与 handleChatMessage 的 send 包装不一致（两处实现）。可统一为 `sendWs` 内部自动从 msg 提取——当前功能正确，仅一致性建议。

### 审查结论
- **必须修（P1）**：C6（replay 失效，实锤 bug）、C7（updater 副作用）、C8（timer 泄漏）
- **建议修（P2）**：C9（as any）、C10（重复/兜底）、C11（一致性）
- **P0**：无（T5/T7/T8 核心逻辑正确，无数据丢失/崩溃/安全问题）
