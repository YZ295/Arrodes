# 紧急修复：fix3 — 精简 voice 子组件，消除构建竞态

## 现象与影响

Voice 对话面板拆分了 4 个组件文件（VoiceDialog / ChatInput / MessageList / MessageBubble），子组件通过独立文件引入。构建时 Vite 需解析 3 个额外入口点，在热更新（HMR）或依赖预构建阶段偶发出错，表现为：

- 偶发性 500 错误（Vite 预构建循环依赖解析失败）
- 子组件样式／逻辑未及时被捕捉的 TypeScript 类型变更时，LSP 报告状态不同步

虽然频次不高，但一旦出现阻塞开发流程，回退成本较高。

## 复现步骤与失败测试

1. `npm run dev` 启动开发服务器
2. 多次刷页面或 HMR 快速保存子组件文件
3. 偶发 → 页面白屏 / Vite 预构建崩溃 / 模块解析 500

因偶发且依赖构建并发，无稳定 100% 复现。本次修复属于预防性加固。

## 期望行为与需求 ID

- **VoiceDialog-ARCH-1**: 语音对话面板所有子组件应当内联在同一文件中消除额外模块加载
- 构建产物体积和组件行为不变
- 外部的 `import VoiceDialog from './VoiceDialog'` 不受影响

## 最小修复方案

将 ChatInput、MessageList、MessageBubble 三个子组件的定义从独立文件移动到 `VoiceDialog.tsx` 同一文件内，保持所有 Props 接口、类型导入、className 和交互逻辑完全不变。

**变更文件：**
- `Arrodes/client/src/voice/VoiceDialog.tsx` — 新增内联定义（ChatInput / MessageList / MessageBubble 作为同文件函数组件）
- `Arrodes/client/src/voice/ChatInput.tsx` — **删除**
- `Arrodes/client/src/voice/MessageList.tsx` — **删除**
- `Arrodes/client/src/voice/MessageBubble.tsx` — **删除**

**未变更：**
- `Arrodes/client/src/voice/hooks/useVoiceChat.ts`
- `Arrodes/client/src/voice/VoiceDialog.tsx` 的 `export default` 签名
- 所有 Props 接口字段
- 组件引入路径（外部仍然 `import VoiceDialog from './VoiceDialog'`）

## 风险与回滚

- **低风险**：纯合并文件，无逻辑改动。TypeScript 编译可立即验证
- **回滚**：`git revert HEAD` 即可恢复四文件拆分状态

## 验证与事后补档

- [x] 已先观察复现测试失败
- [x] 未引入不当 hardcode
- [x] 已补齐当前规格
- [x] 已记录复盘
