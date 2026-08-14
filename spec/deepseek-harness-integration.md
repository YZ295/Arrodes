# DeepSeek Harness 集成：工具执行管线（第一性原理）

> 日期：2026-08-14
> 参考：<https://github.com/deepseek-ai/deepseek-harness>（Everything is a Plugin，基于 Cordis）

## 提炼的第一性原理

1. **一切皆插件**：没有特权核心，模型适配器、工具、记忆、Agent 循环本身都可替换。
2. **能力即 seam**：每个能力由 Service Definition / Service Provider / Consumer 三角构成；换 Provider 即换整套行为。
3. **事件即扩展点**：`tools/pre-execute → execute → post-execute` 等瀑布流负责授权、执行与审计。
4. **注册即副作用**：`register` 返回 disposer，卸载时回滚该插件贡献的一切。
5. **模型可见 ⟺ 已记录**：任何进入模型请求的内容都必须能从会话日志重建。

## 本次落地

- `skills/registry.ts`：新增 `ToolPreHook` / `ToolPostHook`，`executeToolCall` 按 `pre → execute → post` 执行；注册钩子返回 disposer。
- `actionGate` 从各技能内部抽离，成为默认 pre 钩子（授权策略）；技能只声明 `risk` / `describe` 并提供纯 `execute`。
- `desktop.ts` / `files.ts` / `mcp.ts` / `command.ts` 移除内联 actionGate，改为元数据驱动。
- `registry.test.ts`：新增管线测试（pre 短路、post 观察、disposer 撤销）。

效果：授权策略与技能执行解耦；后续加日志、审计、限流等策略只需注册 pre/post 钩子，不再改动技能本体。

## 进展（按第一性原理排序）

- [x] **会话日志投影**（模型可见 ⟺ 已记录）：`services/modelHistory.ts` 提供 `deriveSessionHistory` 与 `assembleModelMessages`，main/dev/handler 已统一使用（`2c5b0fa`）。
- [x] **turn 生命周期事件**：`Harness` 增加 `on`/`emit`（返回 disposer），发出 `turn:start` / `turn:end` / `turn:error`（`64c143b`）。
- [x] **能力 seam 化（部分）**：fs（`services/fsProvider.ts`）、subprocess（`services/commandProvider.ts`）已抽象为 Definition/Provider/Consumer 三角（`a92ed7e`）。
- [ ] **llm seam**：把 DeepSeek 适配器抽象为 `LlmProvider`（当前 `llmService.ts` 已较隔离，但未定义 Provider 接口）。
- [ ] **profiles/bundles**：按配置文件组合插件树（当前无此概念）。
