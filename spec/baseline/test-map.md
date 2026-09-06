# 测试基线（2026-08-12 复核版）

## 现有测试

- server（vitest）：28 个测试文件，138 个用例 —— db/、ws/、middleware/、services/、harness/、skills/
- client（vitest）：3 个测试文件，15 个用例 —— MessageChannel、llmStage、ttsLogic 等

## 测试命令

- server：`npm --prefix Arrodes/server run test`（vitest run）
- client：`npm --prefix Arrodes/client run test`（vitest run）
- 类型检查：`npm --prefix Arrodes/server run typecheck`
- 构建：`npm --prefix Arrodes/client run build`

## 测试缺口

- 桌面壳 GUI 生命周期无自动化（需人工：开窗/关窗回收/端口占用/崩溃弹窗）
- 无端到端聊天链路测试（WS 全链路依赖真实 LLM Key）
- 无覆盖率门槛配置
