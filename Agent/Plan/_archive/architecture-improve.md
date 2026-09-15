# Arrodes 架构优化报告（improve-architecture 收尾版）

> 日期：2026-08-08 ｜ 输入：code-review.md v1/v2 + 11 张 ticket 全部完成后盘点
> 结论：**核心架构问题已全部解决**，剩余为 4 项技术债（2 P1 + 2 P2）

---

## 一、目标架构图（当前实际状态）

```
┌──────────────────────────────────────────────┐
│ client（React, 223 行 useVoiceChat 组合式）      │
│  hooks ← pipeline(订阅式 llmStage) ← MessageChannel │  ← requestId 派发 ✅
│  components：Sidebar(+光束) / ChatOverlay(+orb)    │
│  TTSControl(+自定义音色) / StatusBar(+静音/隐藏)     │
└──────────────┬───────────────────────────────┘
               │ REST + WS（requestId 关联 ✅）
┌──────────────▼───────────────────────────────┐
│ server（Express, zod 校验 ✅）                   │
│  routes → services → repos → better-sqlite3    │
│  harness（main/memory 已注册；route 仍硬编码 ⚠️）   │
│  ttsService（纯本地 ✅）                         │
└──────────────┬───────────────────────────────┘
               │ HTTP (12001)
┌──────────────▼───────────────────────────────┐
│ tts-sidecar（Python, zero-shot 自定义音色 ✅）     │
│  CosyVoice2-0.5B（CUDA）                        │
└──────────────────────────────────────────────┘
```

**本轮已达成**（对比 architecture-review.md）：
- P0 全清：31 个测试 ✅ / 双壳删除 ✅ / llmStage 订阅式（0 处 as any）✅
- P1 大部分：Edge 云端移除 ✅ / 双记忆服务合并 ✅ / zod 引入 ✅
- P2 部分：store 收敛 2 个 ✅ / useVoiceChat 342→223 行 ✅

---

## 二、剩余技术债清单（决策表）

| # | 问题 | 现状 | 建议 | 风险 | 对应 |
|---|------|------|------|------|------|
| A | MemoryGateway `setTimeout(500)` 伪等待 | 记忆提取靠猜 | 改 chatSimple 返回完成态 + await 真完成 | 低（记忆丢失概率↓） | 无 ticket，可新增 |
| B | harness `route()` 硬编码 'main' | 多 Agent 路由形同虚设 | 按 intent/关键词分发（意图检测已存在） | 中（改动对话行为） | 无 ticket，需新开 |
| C | WS `data: Record<string, unknown>` | payload 无编译期校验 | 判别联合 + 泛型（chunk/complete/memory 独立类型） | 低 | 无 ticket |
| D | validate.ts 死代码 | 已无引用 | **直接删除** | 零 | 顺手清理 |
| E | tts-sidecar 无 requirements.txt | 环境不可复现 | 补 pip 依赖锁定 | 低 | 无 ticket |

---

## 三、演进路径（按风险消除排序，全部有测试兜底）

### 阶段 1：清理死代码（零风险，5 分钟）
- 删除 `server/src/middleware/validate.ts`（已无引用，zod 全面替代）
- 验收：tsc + 31 测试全绿

### 阶段 2：记忆完成态（P1-A，消除"记忆靠猜"）
- MemoryGateway 的 chatSimple 返回 `{ text, done }` 完成态，去掉 `setTimeout(500)`
- 先写测试锁定现状 → 改实现 → 测试验证
- 验收：记忆提取测试 + 全量回归

### 阶段 3：WS payload 强类型（P1-C，编译期安全）
- shared/types：`WSChunkData/WSCompleteData/WSMemoryData/...` 已有，把 `WSServerMessage.data` 改判别联合
- 涉及 server 发送端 + client 接收端，先跑 31 测试确保不破坏
- 验收：tsc 严格模式通过 + 全量测试

### 阶段 4：Agent 路由（P1-B，功能增强，可延后）
- harness.route 按 intent（client 已检测）分发到 main/memory/skills
- 需业务确认（是否要让用户显式选 Agent），风险中，**建议单独排期**

### 阶段 5：sidecar 环境锁定（P2-E）
- 导出 `pip freeze` 生成 requirements.txt（依赖 cosyvoice 环境）
- 纯文档性质，零风险

---

## 四、权衡说明

| 决策 | 放弃什么 | 换来什么 |
|------|---------|---------|
| 纯本地 TTS（已完成） | Edge 免费音质多样性 | 零成本/离线/隐私不出本机；代价=依赖 GPU 环境 |
| 订阅式通道（已完成） | 简单的全局回调 | 并发不串线 + 类型安全 |
| 自定义音色（已完成） | 上传音频的管理成本 | 专属音色体验 |
| 记忆完成态（阶段2） | setTimeout 的"简单" | 记忆不丢失（确定性） |

---

## 五、下一个该执行的项

**建议：阶段 1（删 validate.ts 死代码）+ 阶段 2（记忆完成态）** —— 都是低风险、有测试兜底、能立刻消除剩余的确定性风险。阶段 4（Agent 路由）需先拍板再动。
