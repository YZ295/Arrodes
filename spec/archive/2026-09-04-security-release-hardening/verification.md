# 验证记录：security-release-hardening

## TDD 证据

### RED｜2026-09-03

命令：

`npx vitest run src/services/localAccess.test.ts src/services/fileAuthorization.test.ts src/services/releaseScripts.test.ts src/services/actionGate.test.ts src/skills/files.test.ts src/ws/handler.test.ts src/services/visionService.test.ts src/routes/vision.test.ts`

结果：8 个文件失败（43 个测试中 37 个旧行为通过、6 个新行为失败，另有 3 个待实现模块无法导入）。失败原因与规格一一对应：本地访问和目录授权模块不存在、动作无 owner 查询、全局连接任务中止、视觉异常路径留下临时图片、服务端测试与桌面打包脚本不符合发布约束、视觉未做格式/签名校验。该结果是实现前基线，未通过删改旧测试掩盖。

## 自动验证

<!-- `verify` 命令在此追加摘要。 -->

## 审查

- [x] 规格符合性审查：逐项覆盖本机访问、owner 绑定、目录 allowlist、WS 隔离、视觉与发布闸门。
- [x] 代码质量审查：独立复核后修复了确认弹窗遗漏 `sessionId`、通用 config 绕过目录校验、非法 Origin 和 127.0.0.1 开发 Cookie 主机不匹配。
- [x] 未引入不当 hardcode：临时访问令牌每次桌面启动随机生成，端口外的 UI Origin 从启动配置推导。
- [x] 独立复审：本代理按 `code-review` 流程复审；无遗留 P0/P1 发现。

## 偏差、风险与遗留债务

- 前端 lint 保留 4 条与本变更无关的既有警告；本变更新增的两个 Hook 依赖警告已消除。
- 客户端生产入口仍为约 582 KB，构建仅发出既有体积提示；代码拆分不属于本安全修复范围。
- `stash@{0}` 仍保存用户的视觉/DSH 市场在途修改，未被本变更读取或覆盖。
- TencentDB Agent Memory 的容器部署和适配器接入是独立架构变更，尚未与本安全修复混合实施。

### 自动验证 2026-09-03T19:26:20+08:00

- 范围：`full`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过

### 自动验证 2026-09-04T09:35:41+08:00

- 范围：`full`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过

### 自动验证 2026-09-04T10:18:53+08:00

- 范围：`full`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过
