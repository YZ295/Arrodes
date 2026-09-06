# 轻量变更：inputbar-indent

## 分类理由

纯视觉微调：对话底部输入栏容器由 `px-4` 改为 `px-8`，输入卡片左右各留两格（约 32px）空距，
不再紧贴主区域左边缘。不涉及接口、依赖、数据或跨模块行为变化。

## 范围

- `Arrodes/client/src/components/ChatOverlay.tsx`：输入栏底部容器左右留白 4 → 8（两格）。

## 风险与回滚

- 风险极低：仅 Tailwind 间距类变化，不影响交互与布局宽度上限（卡片仍 `max-w-3xl` 居中）。
- 回滚：还原 `px-8` 为 `px-4` 即可。

## 验证

- [x] 已确认没有行为、接口、依赖或跨模块变化
- [x] 未引入不当 hardcode
- [x] 已运行适用的验证

### 自动验证 2026-08-24T19:07:23+08:00

- 范围：`targeted`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过
