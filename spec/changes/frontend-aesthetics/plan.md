# 实施计划：frontend-aesthetics

> 本文件批准后保持不可变；任务进度写入 `spec/state.json`。

## 任务

1. 为响应式导航策略与单一状态消息选择编写失败测试，保存 RED。
2. 实现最小纯函数并转绿；修复全局间距、焦点和 reduced-motion 基础层。
3. 按“精密工作台”改造 App、Sidebar、StatusBar、ChatOverlay、NeonInputBar、PanelView，仅对 ConfirmDialog/WorkspacePanel 做视觉调整并保留安全行为。
4. 运行客户端测试和构建；运行 Impeccable detector；在 1440×900 与 390×844 一次批量视觉检查后修复，再做一次确认。
5. 写 PRODUCT.md、DESIGN.md、当前有效规格与验证记录，完成规格/代码审查并归档。

## 原子提交边界

1. `docs(spec): 批准前端精密工作台规格与计划`
2. `test(ui): 锁定响应式与状态呈现行为`
3. `refactor(ui): 重塑阿罗德斯精密工作台界面`
4. `docs(spec): 归档前端审美变更`
