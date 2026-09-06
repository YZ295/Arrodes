# 测试计划：frontend-aesthetics

## 需求—测试映射

| 需求 ID | 测试文件/用例 | 层级 | 预期 RED | 验收结果 |
|---|---|---|---|---|
| REQ-001 | `src/ui/layoutPolicy.test.ts` 窄屏/桌面导航策略 | unit | 模块不存在 | 390px 紧凑、桌面遵循用户折叠选择 |
| REQ-003 | `src/ui/statusPresentation.test.ts` 状态优先级与去重 | unit | 模块不存在 | 一个状态消息、错误优先 |
| REQ-002/004/006 | 桌面与窄屏截图、键盘焦点检查 | visual/manual | 当前截图层级/裁切/焦点失败 | 两尺寸可读可操作 |
| REQ-005 | 既有客户端测试与生产构建 | regression | 不适用 | 全绿且安全 props/授权逻辑保留 |

## 验证命令

- `npm --prefix Arrodes/client test`
- `npm --prefix Arrodes/client run build`
- Impeccable detector（仅变更目标）
- Wu5 `verify full`
