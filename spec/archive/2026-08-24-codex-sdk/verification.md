# 验证记录：codex-sdk

## TDD 证据

- RED：新增 4 个测试文件首跑 4 failed（`CodexSdkAdapter` 不存在、
  `buildAgentChatTask` 不存在、`createCodexAdapter` 不存在、
  `agentProtocols` 未注册），失败原因即模块缺失。
- GREEN：实现 `codexSdkAdapter.ts`、接口抽离 `agentAdapterTypes.ts`、
  `buildAgentChatTask` + 路由改造、`agentProtocols.ts` 注册后，
  目标测试 29/29 通过。
- 重构后验证：`typecheck` 修复 zod 显式化与测试类型后零错误；
  全量服务端测试 84 文件 430 用例通过。

## 自动验证

（`wu5_flow.py verify` 自动追加）

## 端到端冒烟（真实 SDK）

1. `new Codex()` + `startThread({ workingDirectory, skipGitRepoCheck: true,
   sandboxMode: 'workspace-write', approvalPolicy: 'never' })` → `run('只回复：你好呀')`
   → 返回 `你好呀`，thread id 正常（SDK 随包二进制 + 登录态可用）。
2. 同线程第二轮 `run('我刚才让你记的暗号是什么？…')` → 返回 `紫色香蕉`，
   证明多轮记忆由 codex Thread 原生保持，不依赖历史拼接。

## 审查

- [x] 规格符合性审查：REQ-001~009 全部实现——依赖可解析；线程复用/隔离/
  一次性；权限映射三档断言；中止/超时/串行；stateful 路由分支（含
  非 stateful 行为不变）；env 切换 CLI + ENOENT 回退；模型/推理档透传；
  metagpt/openbot SKILL.md 就位；注册表登记 + 缺文件降级。
- [x] 代码质量审查：适配器与注册表分层一致；`agentAdapterTypes.ts` 消除
  模块循环依赖；超时/中止统一走 AbortSignal；失败线程丢弃重建；并发
  串行用 promise 链；外部路径均经环境变量（CODEX_HOME）解析。
- [x] 未引入不当 hardcode：`E:\AI\Codex` 仅在测试断言中出现，代码路径
  一律 `process.env.CODEX_HOME || ~/.codex`。
- [x] 独立复审：不适用（单代理环境），以规格符合性 + 代码质量两轮自审
  替代，验证证据可审计。

## 偏差、风险与遗留债务

- 偏差：REQ-006 场景原写「SDK 构造抛 ENOENT」，实现同时覆盖构造期
  （`createCodexAdapter` 捕获）与运行期（回合内 ENOENT 回退），范围等价。
- 风险：默认权限下 codex 真正受沙箱限制（比旧 CLI 全权限更安全），
  用户若需全盘操作须显式选「全部权限」。
- 遗留：codex 线程按进程内存复用；跨进程 `resumeThread` 恢复能力已具备，
  持久化会话映射留待后续。

### 自动验证 2026-08-24T19:25:37+08:00

- 范围：`targeted`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过
