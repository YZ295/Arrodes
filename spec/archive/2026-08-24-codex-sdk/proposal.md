# 变更提案：codex-sdk

## 问题与背景

OpenAI 已于 2026-08 开源 Codex 平台（Apache-2.0，github.com/openai/codex），
提供 `@openai/codex-sdk`（TypeScript，0.149.1）作为集成入口：有状态多轮
Thread、`runStreamed` 结构化事件、`resumeThread` 会话恢复、三档 sandbox
（read-only / workspace-write / danger-full-access）与 approval policy。

阿罗德斯目前把 codex 作为「单轮无状态 CLI」接入（`CodexCliAdapter`：
每次任务建临时文件调 `codex exec --ephemeral`，多轮靠路由层拼接历史），存在痛点：
1. 无真实会话状态：上下文靠文本拼接，token 重复、记忆边界粗糙；
2. 无结构化事件：无法感知工具调用/文件变更/推理进度；
3. 无权限映射：沙箱由 `SELF_MODIFY_SANDBOX` 一刀切（默认全权限）；
4. 临时文件方案在 Windows 下易残留、命令转义易出错。

## 目标

1. 用 `@openai/codex-sdk` 替换底层执行通道，使 codex 成为有状态、多轮、
   可选沙箱权限的一等 agent；
2. 保留阿罗德斯 harness 编排层（多 agent 注册/意图路由/事件总线）不动；
3. 权限映射：default→workspace-write、full→danger-full-access；
4. 保留 CLI 适配器作为回退（env 可切换），不破坏 hermes/workbuddy/dsh 等其他 adapter。

## 非目标

1. 不重构阿罗德斯 harness 本身；
2. 不引入 A2A 协议互信；
3. 不做 UI 改动（输入栏留白已单独走 light 变更）；
4. 不迁移既有会话历史到 codex thread（旧历史仍由 Arrodes 落库）。

## 影响范围

服务端：`package.json`（新增依赖）、`agentAdapters.ts`（新适配器 + 注册）、
`workspaceAgents.ts`（chat/tasks 路由传 sessionKey/permission）、
`agentTasks.ts`（opts 透传）、`agentAdapters.test.ts`（新增用例）。

## 风险

1. SDK 0.149.1 随包携带自带 codex CLI 二进制（`@openai/codex-win32-x64`），
   与本机 0.146.1 不是同一版本；需已登录或 `CODEX_API_KEY` 才能跑通；
2. SDK 的 `approvalPolicy` 在非交互管道下不能逐项确认——阿罗德斯侧采用
   `never` + sandbox 兜底；逐项确认语义由 Arrodes 自身 actionGate 承担
   （仅影响阿罗德斯内置技能，不改现状）；
3. 默认权限下 codex 真正被沙箱限制在项目目录内，比当前 CLI 适配器更安全，
   但行为与现状不同（现状默认也是全权限）——需向用户明示；
4. 新增 npm 依赖属 full 变更，必须经 spec/plan 批准 + dependency 批准后实施。

## 验收标准

1. `CodexSdkAdapter` 单测全绿：线程复用、权限映射、中止、超时、busy 串行；
2. 路由层单测覆盖 stateful 分支（不发历史、传 sessionKey/permission）；
3. 全量 server 测试 + client 测试 + tsc + build 通过；
4. 手工冒烟：与 codex 对话连续两轮，codex 记得上一轮内容（不靠历史拼接）。
