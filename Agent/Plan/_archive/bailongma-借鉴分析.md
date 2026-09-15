# BaiLongma 深度分析 → Arrodes 适配方案

> 日期：2026-08-08 ｜ 参考项目：https://github.com/YZ295/BaiLongma（白马 v2.1.515）
> 目标：借鉴 BaiLongma 的成熟设计，按 Arrodes 自身特点合理适配，不照搬代码

---

## 一、BaiLongma 架构总览

```
Electron 桌面壳（窗口/托盘/自动更新）
    │
    ▼
src/index.js  ← 主循环（Agent 心脏）
    ├─ 用户消息 / 后台消息 / 提醒 / 任务续跑 / 空闲心跳
    │        （LLM-directed tick：Agent 自主决定心跳节奏）
    ▼
src/api.js   本地 HTTP + SSE + WebSocket（127.0.0.1:3721）
    ▼
├─ src/llm.js        多 Provider 流式调用（DeepSeek/MiniMax/OpenAI/Qwen/Moonshot/Zhipu/MiMo）
├─ src/db.js         SQLite 持久化（对话/记忆/提醒/预取/媒体/线程状态）
├─ src/memory/       记忆识别/注入/线程/焦点/召回/整理/去重合并 + 人物卡片
├─ src/context/      动态上下文注入（记忆+对话+画像+工具结果+UI信号+预取）
├─ src/capabilities/ 工具系统（schema 按需注入 + 工具市场）
├─ src/social/       Discord + 微信桥接（外部消息进主循环）
├─ src/voice/        云端 ASR + 多 TTS + 流式合成
└─ src/ui/brain-ui/  Brain UI（思考流/记忆图/焦点线程/热点/人物卡/ACUI卡片）
```

**设计理念**：让 Agent **持续运行、能主动行动**——聊天只是它能力的一部分，记忆整理、任务续跑、空闲刷新、主动提醒才是 BaiLongma 的灵魂（对应它文档里的"Agent 时间感知理论"）。

---

## 二、Arrodes vs BaiLongma 对比

| 能力 | BaiLongma | Arrodes | 差异判定 |
|------|-----------|---------|---------|
| 桌面壳 | Electron（主进程+托盘+自动更新） | Electron desktop/ | ✅ 已有 |
| 本地 HTTP | 内置 3721 | Express 3002 | ✅ 已有 |
| 实时通信 | SSE + WS | WS（requestId 协议） | ✅ 已有（更强） |
| 记忆系统 | SQLite + 检索/召回/整理/去重 | MemoryGateway + memory-repo | ⚠️ 有基础，缺"主动整理/去重合并" |
| 动态上下文 | 完整注入管线 | retrieveContext 基础版 | ⚠️ 有雏形 |
| 多模型 | 7 家 Provider | 6 个模型（deepseek/kimi/glm/ollama） | ✅ 已有 |
| 工具系统 | capabilities/ 按需注入 + 工具市场 | skills/ 6 个（builtin/computer/devworkflow/reminder/web） | ✅ 已有基础 |
| **主循环** | 持续运行 + 空闲心跳 + 任务续跑 | **无**（纯请求-响应） | ❌ **最大差距** |
| **主动提醒** | 提醒 + 预取 + 后台消息 | reminder 技能（30s 轮询） | ⚠️ 有雏形 |
| **社交连接器** | Discord + 微信桥接 | **无** | ❌ 缺失 |
| **人物卡片** | 对话中自动识别陌生人物并显示 | **无** | ❌ 缺失 |
| **Brain UI 面板** | 思考流/记忆图/热点/焦点线程 | Sidebar 面板（记忆/技能/工作区） | ⚠️ 有部分 |
| 语音 | 云端 ASR + 多 TTS | **本地 CosyVoice + 自定义音色** | ✅ 反超（更隐私） |
| 视觉 | border-beam 光束 / 玻璃拟态 | ✅ 已有（NeonInputBar/Subtitle/SidebarBeam） | ✅ 对齐 |

---

## 三、BaiLongma 最值得借鉴的 5 点（按价值排序）

### 1. 主循环（持续运行 Agent）⭐ 最高价值
BaiLongma 与 Arrodes 的本质区别：**BaiLongma 是"活的"**，Arrodes 是"被动的"。
- BaiLongma 空闲时：整理记忆、检查任务、刷新上下文、心跳思考
- Arrodes 现状：只有用户发消息才响应，无任何自主行为

**借鉴**：给 Arrodes 加一个轻量 `mainloop`（每 30-60s tick）：
- 空闲心跳：检查是否有到期提醒、未完成任务
- 定期记忆整理：调用 MemoryGateway 对"短期记忆"去重合并（BaiLongma 的核心记忆维护）
- 状态推送：把 Agent 当前状态（思考中/空闲/忙碌）推给前端/桌宠

### 2. 记忆系统升级（主动整理 + 去重合并）
Arrodes 记忆已有"提取+存储+检索"，但**缺"整理"**：
- 检索无排序/权重（BaiLongma 有召回排序）
- 重复记忆不去重合并

**借鉴**：`MemoryGateway` 增加 `consolidateMemories()`：
- 相似记忆检测（文本相似度/关键词重叠）→ 合并
- 定期（配合 mainloop）整理，避免记忆膨胀

### 3. 人物卡片（对话中识别陌生人物）
BaiLongma 的特色功能：聊到某人物时自动显示人物简介卡片。
**借鉴**：在检索记忆时，若命中"人物实体"（用户画像 events/事实），前端展示人物卡（复用现有 Sidebar 面板体系）。

### 4. 多 Provider 抽象（已有基础，补配置 UI）
Arrodes 已有 6 模型，但 **API key 硬编码在 .env**。BaiLongma 有**激活页/设置页**管理多 Provider。
**借鉴**：ModelSettings 面板已存在——补"Provider 选择 + 自定义 baseUrl"配置（轻量）。

### 5. 社交连接器（Discord/微信）⚠️ 需谨慎
这是 BaiLongma 的扩展能力，但实现复杂（微信 ClawBot 桥接）。
**借鉴**：**暂缓**。作为远期方向记录，当前项目重点应是 1-3。

---

## 四、适配方案（分阶段，每阶段有测试兜底）

### 阶段 A：主循环 + 主动记忆整理（最高价值，先做）
- **改动**：
  1. 新增 `server/src/services/mainloop.ts`：`setInterval` 30s tick
  2. tick 逻辑：`pollDueReminders()`（已有）+ `consolidateMemories()`（新）
  3. MemoryGateway 增加 `consolidateMemories()`：找重复记忆 → 合并 → 更新
  4. 状态推送：tick 时把 Agent 状态推给 WS 客户端（供 UI/桌宠显示）
- **测试**：MemoryGateway 新增 consolidate 测试（造重复记忆 → 验证合并）
- **风险**：低（纯增量，不动现有请求链路）

### 阶段 B：记忆召回排序 + 人物识别
- **改动**：
  1. `retrieveContext` 检索加排序（时间衰减 + 关键词权重）
  2. 新增人物实体识别：记忆内容含"人名"模式 → 标记 entity
  3. 前端：记忆面板展示"人物卡"区块
- **测试**：retrieveContext 排序测试 + 人物识别测试
- **风险**：中（检索逻辑改动影响对话质量，需回归）

### 阶段 C：多 Provider 配置 UI（轻量）
- **改动**：ModelSettings 面板支持选择 Provider + 填自定义 baseUrl/key
- **测试**：ttsService 已有测试模式可复用
- **风险**：低

### 阶段 D：社交连接器（远期，记录不执行）
- Discord/微信桥接，复杂度高，暂列为 backlog

---

## 五、明确"不照搬"的原则

1. **通信层不换**：BaiLongma 用 SSE，Arrodes 用 WS+requestId（更强，保留）
2. **UI 不抄**：BaiLongma 是原生 JS Brain UI，Arrodes 是 React 组件体系——只借鉴"面板概念"，不搬代码
3. **语音不退化**：BaiLongma 云端 TTS，Arrodes 本地 CosyVoice（隐私优势，保留）
4. **记忆存储不换**：Arrodes 用 better-sqlite3 + repo 层，保持

---

## 六、立即执行建议

**先做阶段 A（主循环 + 记忆整理）**——这是 BaiLongma 与 Arrodes 的本质差距（"活的" vs "被动的"），价值最高、风险最低、可测试。阶段 B/C 在其后按需推进。
