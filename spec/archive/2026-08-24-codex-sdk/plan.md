# 实施计划：codex-sdk

> 本文件批准后保持不可变；任务进度写入 `spec/state.json`。

## 任务

1. 依赖：`npm install @openai/codex-sdk`（server），登记 dependency 批准；
   运行类型检查确认 REQ-001（RED：安装前 import 报错 → GREEN：安装后可解析）。
2. 测试先行：为 `CodexSdkAdapter` 编写失败单测（fake Codex/Thread 注入），
   覆盖 REQ-002~004（线程复用/隔离/一次性、权限映射、中止/超时/串行）；
   运行确认 RED。
3. 实现 `codexSdkAdapter.ts` + 注册回退逻辑（REQ-006/007），单测转绿。
4. 扩展 `AgentChatAdapter` 接口与 chat/tasks 路由（REQ-005），补路由层
   失败测试 → 实现 → 转绿。
5. 技能：安装 metagpt（社区 SKILL.md）并编写 openbot SKILL.md 到
   `$CODEX_HOME/skills/`（REQ-008，已完成）；为阿罗德斯技能注册表新增
   metagpt/openbot（REQ-009），RED→GREEN。
6. 重构 + 全量验证：server vitest、client vitest、tsc、client build。
7. 双层审查（规格符合性 + 代码质量 + hardcode 检查），更新当前规格并归档。

## 原子提交边界

1. `chore(deps): 新增 @openai/codex-sdk`（含 dependency 批准记录）
2. `test(server): CodexSdkAdapter 失败测试（RED）`
3. `feat(server): CodexSdkAdapter 实现 + 注册回退（GREEN）`
4. `feat(server): chat/tasks 路由有状态路径（sessionKey/permission）`
5. `feat(server): 技能注册表登记 metagpt/openbot（REQ-009）`
6. `test(server): 全量验证 + 验证证据登记`
7. `docs(spec): 归档 codex-sdk`
