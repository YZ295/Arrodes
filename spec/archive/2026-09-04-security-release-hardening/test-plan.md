# 测试计划：security-release-hardening

## 需求—测试映射

| 需求 ID | 测试文件/用例 | 层级 | 预期 RED | 验收结果 |
|---|---|---|---|---|
| REQ-SECURITY_RELEASE_HARDENING-001 | `src/services/localAccess.test.ts`：凭据、Cookie、Origin 和 WS 握手策略 | unit/contract | 策略尚不存在，测试无法导入 | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-001 | Electron 启动路径静态/行为测试或等价构建验证 | integration | Electron 未生成/注入短期凭据 | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-002 | `src/services/actionGate.test.ts`：owner-scoped list/get/confirm/deny，自动批准不可绕过 | unit | 现有 `PendingAction` 无 owner 且有全局 latest | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-002 | `src/routes/actions.test.ts`：会话 B 不能看到或处理会话 A 的待确认动作 | integration | 现有 REST 路由公开全量 pending | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-003 | `src/services/fileAuthorization.test.ts`：根目录、前缀、相对路径、链接、撤销、move/copy 双端 | unit | 授权解析器尚不存在 | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-003 | `src/skills/files.test.ts`：无 scope、未授权读、待确认后撤销均不触及磁盘 | unit | 当前任意绝对路径可读/写 | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-004 | `src/ws/handler.test.ts`：关闭连接只中止该连接控制器 | unit | 当前 close 遍历全局 `activeTasks` | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-005 | `src/services/visionService.test.ts`：格式/Base64/签名/大小和远端超时 | unit | 当前仅做最小长度检查 | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-005 | `src/routes/vision.test.ts`：失败、非法输入和成功后上传目录为空 | integration | 当前异常路径不清理临时文件 | 待执行 |
| REQ-SECURITY_RELEASE_HARDENING-006 | package-script assertions + 真实构建命令 | static/integration | 当前服务端测试会发现 `dist`，桌面打包不重建上游产物 | 待执行 |

## 验证命令

- `npm --prefix Arrodes/server exec vitest run src/services/localAccess.test.ts src/services/actionGate.test.ts src/services/fileAuthorization.test.ts src/skills/files.test.ts src/ws/handler.test.ts src/services/visionService.test.ts src/routes/vision.test.ts src/routes/actions.test.ts`
- `npm --prefix Arrodes/server exec vitest run src`
- `npm --prefix Arrodes/server run typecheck`
- `npm --prefix Arrodes/client test`
- `npm --prefix Arrodes/client run lint`
- `npm --prefix Arrodes/client run build`
- `npm --prefix Arrodes/desktop run build`
- `npm --prefix Arrodes/server audit --omit=dev`
- `git diff --check`
