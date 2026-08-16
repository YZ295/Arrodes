# 轻量变更：agent-seminar

> 说明：本变更实际为完整功能（多 Agent 研讨会），因用户已直接批准实施且
> 提交早于变更登记，按 light 模式补记。功能范围与验证见 tickets T-07 及提交记录。

## 分类理由

功能新增：画布研讨会（互相对话学习）。变更已实现并验证，此处补记追踪；
实质影响范围比 light 大，故在 tickets.md 登记 T-07 完整验收条件。

## 范围

- 服务端：`workspace_seminars` / `workspace_seminar_messages` 两张新表（schema 幂等建表）
- 服务端：`seminarService`（A/B 轮流对话编排、阿罗德斯四段学习提炼、共享记忆写入、学习注入）
- 服务端：`/workspaces/:id/agents/seminars` 创建/列表/详情接口；对话路由自动注入过往学习
- 服务端：`llmProvider` 新增 `thinkingDisabled` 参数（关思考避免空响应）
- 客户端：画布顶栏「✦ 研讨会」入口 + `SeminarDialog`（选 A/B、主题、轮数、实时轮询、学习小结、历史）

## 风险与回滚

- 研讨会异步执行期间服务重启会留下 running 状态记录（可手动改状态，无数据损坏）
- DeepSeek 思考模型空响应风险已通过关思考 + 2048 预算 + 重试缓解
- 回滚：撤销提交即可，新表对旧代码无影响（IF NOT EXISTS）

## 验证

- [x] 已确认没有行为、接口、依赖或跨模块变化
- [x] 服务端测试 78 文件 386 用例全绿（含研讨会 10 个专项用例）
- [x] 客户端构建通过（tsc + vite build）
- [x] 服务端 tsc --noEmit 通过
- [x] 真实端到端：codex ↔ hermes 研讨会 done，四段学习小结写入共享记忆
- [x] 学习注入验证：codex 对话中引用了研讨会结论
- [x] 未引入不当 hardcode（agent id、轮数上限等为业务常量，已有命名与校验）


### 自动验证 2026-08-16T19:27:45+08:00

- 范围：`targeted`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过

### 自动验证 2026-08-16T19:28:17+08:00

- 范围：`targeted`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过

### 自动验证 2026-08-16T19:28:49+08:00

- 范围：`targeted`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过
