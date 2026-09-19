# 统一执行器协议：本地技能适配器验证（2026-09-19）

## 交付范围

- 定义后端无关的 `ExecutionRequest`、`ExecutionResult`、`ExecutionError`、`ExecutionEvidence` 与 `Executor`。
- 首个适配器覆盖 Butler 本地技能执行管线。
- 统一区分 `completed`、`pending`、`failed`、`cancelled` 状态。
- 未知技能、禁用技能、后端错配、策略拒绝和执行异常不再只能靠自然语言猜测，均具备稳定错误码。
- 既有 `executeToolCall` 文本接口继续兼容，避免一次性迁移聊天链路。

## RED

命令：

```text
node node_modules/vitest/vitest.mjs run src/skills/registry.test.ts
```

结果：新增 4 项全部失败，原有 4 项通过；失败原因为 `executeLocalSkillRequest` 尚不存在。

## GREEN 与回归

- 定向测试：`registry.test.ts` 8 项全部通过。
- Butler 服务端全量：60 个测试文件、357 项测试全部通过。
- `npm run typecheck`：通过。

## 意图授权增量

- 现有 action 已映射到稳定业务意图，再由意图决定风险等级；未知意图默认高风险。
- 本地技能适配器校验 `operation` 与 `intent` 必须匹配，阻止用低风险意图冒充高风险操作。
- 命令黑名单继续保留在执行器末端，作为纵深防御而非主要授权模型。
- RED：伪造 `filesystem.read` 意图调用其他操作时测试先得到 `completed`；实现校验后返回 `INTENT_MISMATCH`。

## 后续

- 将实际调度入口逐步切换到统一协议，并为 Codex、DSH、MCP 添加适配器。
- 下一阶段以 `intent` 字段为授权对象，替换对具体命令字符串的过度依赖。
