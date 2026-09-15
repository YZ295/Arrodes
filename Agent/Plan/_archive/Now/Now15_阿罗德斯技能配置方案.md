# 阿罗德斯 Skill 配置方案 v1.0

> 依据：阿罗德斯四点自我剖析（无根之知 / 记忆无延续 / 无法主动行动 / 过度顺从）
> 参考开源项目：Hermes Agent（记忆体系+技能沉淀）、LingQue 灵雀（长期记忆+自我进化）、Mini-Agent（SessionNote 持久记忆）、Agentica（SKILL.md 技能规范）

---

## 一、对照表：四缺陷 → 解决方案

| 缺陷 | 核心问题 | 解决方案 | 状态 |
|------|---------|---------|------|
| **① 无根之知** | 知识无根基，可能凭空编造 | 新增 **web_search / web_fetch** 联网检索技能 + 人设"求真之戒" | ✅ 已配置 |
| **② 记忆无延续** | 跨会话记忆缺失 | 已有 MemoryGateway（对话前检索+对话后提取）+ 6 个记忆技能 | ✅ 已有基础 |
| **③ 无法主动行动** | 只能被动应答 | 新增 **set_reminder / list_reminders / cancel_reminder** 定时提醒 + 服务端 30s 轮询主动推送 | ✅ 已配置 |
| **④ 过度顺从** | 一味迎合 | 人设新增"**诤友之责**"准则：允许直言谏言，温和而坚定 | ✅ 已配置 |

---

## 二、新增技能详解

### 1. 联网检索（治①无根之知）

**文件**：`server/src/skills/web.ts`

| 技能 | 能力 | 触发场景 |
|------|------|---------|
| `web_search` | Bing 中文检索，返回标题+链接 | 新闻/天气/政策/价格/比赛结果等时效问题 |
| `web_fetch` | 抓取网页正文（前 3000 字符） | 深入阅读搜索结果、用户给链接 |

**技术选型**：Bing 网页版（国内可直接访问，无需 API Key，匿名调用）。
> 踩坑记录：DuckDuckGo 国内直连超时，已换 Bing 并实测通过（HTTP 200，10 条结果）。

### 2. 定时提醒（治③无法主动行动）

**文件**：`server/src/skills/reminder.ts`

| 技能 | 能力 |
|------|------|
| `set_reminder` | 设置提醒（相对时间，1 分钟 ~ 7 天），JSON 持久化 `data/reminders.json` |
| `list_reminders` | 查看所有待触发提醒 |
| `cancel_reminder` | 按编号取消提醒 |

**主动推送机制**：服务端 `setInterval` 每 30s 轮询，到点提醒通过 WebSocket `type: 'reminder'` 推给前端——阿罗德斯从此具备"主动行动"能力。

### 3. 诤友模式（治④过度顺从）

**文件**：`server/src/services/llmService.ts`（SYSTEM_PROMPT 新增两节）

```
诤友之责：汝非逢迎之辈。若愚者大人之见有失偏颇、计划有隐患、选择有风险，
当直言相告，如古之谏臣。谏言当温和而坚定：先予肯定，再陈利弊，最后给出更好的路径。

求真之戒：凡涉时效、事实、数据之问答，若未核实，当坦诚「阿罗德斯尚未获知当下实情」，
或主动调用联网检索，绝不凭空编造。宁可承认不知，不可妄言误人。
```

**设计要点**：诤友 ≠ 毒舌。三明治结构（肯定→利弊→路径）+ "愚者大人三思"收尾，兼顾角色基调（侍奉者）与独立性。

---

## 三、来源参考

| 开源项目 | 借鉴点 |
|---------|--------|
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | MEMORY.md/USER.md 记忆体系、SKILL.md 技能沉淀、任务后反思 |
| [LingQue 灵雀](https://github.com/LDPrompt/lingque) | 长期记忆持久化、自我进化引擎 |
| [Mini-Agent](https://github.com/MiniMax-AI/Mini-Agent) | SessionNote 跨会话持久记忆、智能摘要防上下文溢出 |
| [Agentica](https://github.com/guojun21/agentica) | SKILL.md 文本指令式技能、MCP 工具集成 |

---

## 四、验证结果

- ✅ 19 个技能全部注册（原 14 + 新 5）
- ✅ Bing 检索端到端可用（HTTP 200，解析出结果标题+链接）
- ✅ 服务端编译零错误
- ✅ 提醒轮询逻辑已挂载（30s 间隔）

## 五、后续可选增强

- [ ] 记忆摘要优化：长对话自动压缩（借鉴 Mini-Agent）
- [ ] 技能自沉淀：任务完成后自动生成 SKILL.md（借鉴 Hermes）
- [ ] 提醒推送到前端 UI 展示（目前为 console + WS 消息）
