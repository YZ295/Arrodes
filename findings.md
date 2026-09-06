# Findings & Decisions

## Requirements

- 修复 2026-09-03 审查中列出的 P0/P1 缺陷，优先保护本地用户数据、工具执行和发布质量。
- 不覆盖已存在的视觉模型与 DSH 市场未提交改动；其失败测试必须作为当前基线处理。
- 未获得用户明确授权时，不提交、推送或合并。
- 用户已授权暂存原有视觉/DSH 在途改动；其可恢复引用为 `stash@{0}: pre-security-release-hardening-user-wip`。
- 当前所选项目目录是默认文件能力范围；项目外目录仅在用户明确授权后可用。

## Research Findings

- `server/src/index.ts` 使用开放 CORS，REST/WS 没有认证；`actions` 路由可列出和确认高风险操作。
- `PendingAction` 没有所有者字段；聊天确认使用全局 `getLatest()`；关闭任一 WS 会清空全部活动任务。
- 文件技能使用任意绝对路径，`read_file` 是低风险；`repoRoot()` 未参与校验。
- Vision 上传只在成功路径删除临时文件；Base64 JSON 受默认解析器限制；DeepSeek Vision 不支持 BMP。
- 当前服务端测试为 264/266 通过；typecheck、客户端测试/构建、桌面编译通过；`npm audit --omit=dev` 发现 `qs` 中危漏洞。
- DeepSeek Harness（DSH）官方定位为仍在演进的 developer preview：其内核已有统一的插件组合、session sandbox、追加式轨迹日志及 Resume/Fork/Search/Replay、subagent/goal 等运行时能力。Arrodes 在桌面交互、Windows 产品壳、语音和个人工作区体验更强，但尚不具备可等价替换这些运行时承诺的内核。
- DSH 市场源文件和两条失败测试处于用户专属 stash，不存在于当前干净基线；本变更将其显式延后，避免以新文件覆盖未来恢复的用户工作。

## Technical Decisions

| Decision | Rationale |
|----------|-----------|
| 部署边界为本机单用户 | 用户已确认；网络监听、认证和 CORS 应收紧到 Electron/本机应用可验证的来源与令牌模型，局域网/远程访问不在范围。 |
| 文件根目录采用能力 allowlist 而非路径黑名单 | 黑名单无法完整覆盖用户数据、系统目录或符号链接逃逸。 |
| 文件权限为“所选项目目录默认 + 明确授权额外目录” | 用户已确认；允许跨驱动器项目，同时保留最小授权边界。 |
| 当前不以 Arrodes 直接替代 DSH | 先完成安全底座；中期将 DSH 作为可选运行时适配器，待补齐可复放轨迹、隔离执行、插件契约和调度能力后再评估替换。 |

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| Wu5 初始为 `ready-to-push`，但 spec/plan 未批准 | 已创建 `fix/security-release-hardening`；当前阶段为 `drafting-spec`。 |

## Resources

- `spec/status.md`
- `spec/workflow.json`
- `E:/project/HermesProject/Obsidian/Memory/inbox/2026-09-03-arrodes-security-release-audit.md`
- https://api-docs.deepseek.com/guides/vision/
- https://www.deepseek.com/harness/en/
- https://github.com/deepseek-ai/deepseek-harness

## Visual/Browser Findings

- 无。
