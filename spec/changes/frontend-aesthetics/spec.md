# 行为规格：frontend-aesthetics

## CHANGED Requirements

### REQ-FRONTEND-AESTHETICS-001：响应式工作区

界面必须在桌面显示可展开侧栏，在窄屏显示不挤占主任务区的紧凑导航；主内容必须允许收缩且不得水平裁切输入区。

#### Scenario：390px 窄屏
- **前置条件**：视口宽度为 390px
- **当**：用户打开主对话工作区
- **则**：导航以紧凑宽度呈现，主内容、消息和输入控件仍可操作

### REQ-FRONTEND-AESTHETICS-002：一致的视觉层级

界面必须使用集中语义令牌表达导航、画布、浮层、文本、边框、主操作和语义状态，不得以紫色光晕或永久装饰动画替代层级。

### REQ-FRONTEND-AESTHETICS-003：状态与错误单一来源

连接、语音和 TTS 错误必须由状态栏统一呈现；相同错误不得在对话区重复出现或与控制按钮重叠。

### REQ-FRONTEND-AESTHETICS-004：可访问交互

键盘交互必须具有可见 `focus-visible` 样式；减少动效偏好必须关闭非必要重复和空间动画；窄屏触控控件高度不得低于 44px。

### REQ-FRONTEND-AESTHETICS-005：行为兼容

改造必须保留会话确认 `sessionId`、工作区额外目录授权、壁纸背景、头像替换、输入栏左右控件语义以及语音按住说话行为。

## ADDED Requirements

### REQ-FRONTEND-AESTHETICS-006：引导型空状态

无消息时必须呈现说明当前能力与下一步动作的简洁空状态，而非低对比占位句。

## REMOVED Requirements

无。
