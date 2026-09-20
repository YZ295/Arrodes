# Desktop Pet Long Reply Scroll — 2026-09-20

## 问题

桌宠气泡中的本地模型回复超过窗口高度后，内容被桌宠根容器裁切，用户无法向下滚动，输入栏也可能被正文挤出可视范围。

## RED

- 新增长回复用例，把 80 段中文回复放入桌宠对话。
- `npx vitest run src/desktop-pet/DesktopPetOverlay.test.tsx --reporter=verbose` 退出 1：页面不存在 `bubble-scroll`，断言收到 `null`；其余 7 项通过。

## GREEN

- 气泡最大高度限制在桌宠窗口内，并改为纵向 flex。
- 状态行和输入栏固定；标题、回复、下一步、验证与错误进入独立纵向滚动区。
- 滚动区支持滚轮/触控板，`tabIndex=0` 允许键盘聚焦滚动，并提供可见焦点环与窄滚动条。
- 长回复测试确认滚动区包含完整正文，输入栏位于滚动区之外。

## 验证

- 客户端全量：32 个测试文件、212 项通过。
- `npm run build`：TypeScript 与 Vite 生产构建通过；仅保留既有大 chunk 警告。
- Impeccable detector：只发现 `desktopPet.css` 两处既有 bounce easing 警告，与本次滚动改动无关。
- 用户现场确认问题已修好。
