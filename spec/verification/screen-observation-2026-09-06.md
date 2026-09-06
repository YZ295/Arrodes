# 屏幕识别结构化观察验证（2026-09-06）

## 本轮范围

- 屏幕观察绑定可修改的用户目标；
- 视觉模型提示要求输出当前应用、用户活动、关键文字和不确定点；
- JSON/Markdown JSON 解析为带时间的结构化观察；
- 普通文本或错误 JSON 安全降级，不伪造结构字段；
- 视觉面板显示结构化证据和观察时间；
- “常驻”文案改为用户显式开启/停止的“屏幕观察”。

## RED 证据

命令：

`npx vitest run src/modules/vision/continuousVision.test.ts src/modules/vision/VisionPanel.test.tsx`

初次结果：退出码 1；16 项中 3 项失败。失败原因为结构化解析函数不存在、界面没有屏幕观察目标输入，符合预期功能缺失。

观察时间测试随后单独进入 RED：退出码 1；界面未显示 `observedAt`。

## GREEN 与回归

- 定向测试：2 个文件、16 项测试全部通过，退出码 0。
- 客户端完整测试：`npm test -- --run`，14 个文件、60 项测试全部通过，退出码 0。
- 生产构建：`npm run build`，TypeScript 与 Vite 构建通过，退出码 0。
- 静态检查：`npm run lint`，退出码 0；存在 4 条原有范围警告，均不位于本轮修改的视觉文件。

## 尚未验证

- 尚未运行真实 Electron 屏幕共享与 Mage-VL 推理，因此不能宣称桌面端端到端通过。
- 当前完成的是结构化屏幕识别，不是自动单步指导；`currentStep`、`expectedEvidence`、`decision` 和 `nextAction` 仍待后续实现。
- 尚未采集系统音频或实现外语视频字幕。
- 尚未持久化屏幕任务状态或支持中断恢复。
