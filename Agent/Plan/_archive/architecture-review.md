# Arrodes 架构审查报告（grill-me 阶段）

> 日期：2026-08-08 ｜ 审查范围：server / client / shared / desktop / tts-sidecar
> 方法：以"提问-质疑"方式审视现有架构，暴露矛盾与隐患，形成待确认共识清单

---

## 一、架构现状（一句话总览）

**单体 Web 应用 + 桌面壳**：Express/WS 后端（server）+ React 前端（client）+ 共享类型（shared）+ Electron 壳（desktop）+ Python TTS sidecar（tts-sidecar），前后端通过 REST + WebSocket 通信，本地 TTS 走独立 Python 进程。

---

## 二、审查发现（按严重度排序）

### 🔴 P0 - 必须立即解决

| # | 发现 | 位置 | 风险 |
|---|------|------|------|
| 1 | **全项目零测试**（server/client/shared/desktop 均无 test 命令） | 所有 package.json | 停止机制、归档、降级链等核心逻辑无回归保障；"能用"全靠人工验证 |
| 2 | **双 Electron 壳并存**：`electron/`（旧 JS）与 `desktop/`（新 TS），根 package.json 的 main 指向旧壳 | 根目录 / electron/ / desktop/ | 打包可能打错壳；维护成本翻倍；新功能只改了 desktop 但入口还是旧的 |
| 3 | **llmStage 侵入式包装私有回调**：`(channel as any)._callbacks` 直接读写 MessageChannel 私有状态 | client/src/pipeline/stages/llmStage.ts:79 | 上游重构即崩；`as any` 掩盖类型错误；管道与通道强耦合 |

### 🟠 P1 - 应尽快重构

| # | 发现 | 位置 | 风险 |
|---|------|------|------|
| 4 | **MemoryGateway 用 `setTimeout(500)` 等非流式 LLM 完成** | server/src/services/MemoryGateway.ts:204 | 网络慢时 500ms 不够 → 记忆丢失；竞态脆弱 |
| 5 | **双套记忆服务**：`memoryService` 与 `MemoryGateway`/workspace memory-hub 并存 | server/src/services/ | 记忆写入可能分流到不同表/逻辑，检索不一致 |
| 6 | **Edge TTS 依赖硬编码 token/UA 签名** | server/src/services/ttsService.ts | 灰色地带，微软改动即失效；无法自动化测试 |
| 7 | **`route()` 硬编码返回 'main'**，多 Agent 路由形同虚设 | server/src/harness/harness.ts | 技能/工作流 Agent 无法按内容路由 |
| 8 | **无 zod/schema 校验**，只有轻量 `validate.ts` | server/src/middleware/ | 请求体错误在运行时才暴露 |

### 🟡 P2 - 技术债

| # | 发现 | 位置 |
|---|------|------|
| 9 | 前端状态分散：Zustand 4 个 store + EventBus + hook 内部 state 并存 | client/src/store/ |
| 10 | `useVoiceChat` 是一个 300+ 行巨型 hook，职责过重 | client/src/voice/hooks/useVoiceChat.ts |
| 11 | WS 协议类型用 `Record<string, unknown>`，payload 无强类型 | shared/types/index.ts |
| 12 | tts-sidecar 无测试、无 pip 依赖锁定（requirements.txt 缺失） | tts-sidecar/ |
| 13 | CosyVoice 模型 5.3GB 不随 exe 分发，依赖本机环境 | tts-sidecar/ |

---

## 三、待确认架构共识（需你拍板）

**Q1 - 桌面壳去留**
旧 `electron/` 壳已废弃（新 `desktop/` 已打包成功），是否删除旧壳并把根 package.json 指向 desktop？

**Q2 - 测试策略**
四端零测试，优先补哪层？
- A. 只补 server 核心（llmService/ttsService/session-repo/harness）——收益最高
- B. 前后端都补（成本高）
- C. 先补"停止机制 + 归档"这两个刚做的功能（回归保障）

**Q3 - 记忆服务合并**
双套记忆服务（memoryService vs MemoryGateway/hub）是否合并为单一数据源？合并会动迁移逻辑，需要确认。

**Q4 - TTS 引擎取舍**
Edge TTS（免费但灰色、易失效）vs CosyVoice 本地（稳定但依赖 GPU 环境）。是否把 Edge 降级为 fallback、本地升为主引擎？

**Q5 - 校验层**
是否引入 zod 统一前后端请求校验（配合 shared 类型）？

---

## 四、推荐优先级（若你同意默认方案）

```
本周（P0）：
  1. 删旧 electron 壳，统一到 desktop
  2. 引入 vitest + 测试基础设施
  3. 为"停止机制/归档/降级链"补回归测试
下周（P1）：
  4. llmStage 改为订阅式（MessageChannel 暴露 onChunk/onComplete 订阅 API）
  5. MemoryGateway 用 Promise 完成态替代 setTimeout
  6. 合并记忆服务（需 Q3 确认）
```
