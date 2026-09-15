# 阿罗德斯 · 下一阶段开发任务

当前进度 60%，还剩两个核心灵魂没装：**LLM 接入** 和 **Hermes 记忆**。


## 任务一：LLM 接入（优先级 P0）

> 目标：替换前端模拟回复，让阿罗德斯说人话


### 需要改什么

1. **后端**：新建 `server/src/services/llmService.ts`，封装 OpenAI 兼容接口（DeepSeek）
2. **后端**：`server/src/ws/handler.ts` 收到消息后，调 `llmService` 流式返回
3. **前端**：`useVoiceChat.ts` 移除模拟回复逻辑，改用 WebSocket 接收真实回复
4. **系统提示词**：注入阿罗德斯角色设定（愚者的仆人 / 古典语气 / 谦逊神秘）


### 技术细节

- **模型**：DeepSeek V4 Flash Free（`deepseek-chat`）
- **地址**：`https://api.deepseek.com/v1`
- **格式**：兼容 OpenAI API，`/chat/completions` 端点，`stream: true`
- **上下文**：携带最近 10 轮消息历史
- **超时**：15s，超时回复"阿罗德斯正在思考，请稍候"


### 验证标准

- [ ] 说话后，后端返回真实 AI 回复（不再是"收到：xxx"）
- [ ] 回复逐字流式显示
- [ ] 回复完成后自动 TTS 朗读
- [ ] 系统提示词生效，语气符合阿罗德斯人设


### 涉及文件

| 文件                                     | 操作                |
| ---------------------------------------- | ------------------- |
| `server/src/services/llmService.ts`      | 新建                |
| `server/src/ws/handler.ts`               | 修改，调 llmService |
| `client/src/voice/hooks/useVoiceChat.ts` | 移除模拟回复        |


## 任务二：Hermes 记忆接入（优先级 P0）

> 目标：让阿罗德斯记住和回忆之前聊过的事


### 需要改什么

1. **对话前检索**：用户发消息时，调 Hermes API 检索相关记忆，注入 System Prompt
2. **对话后存储**：LLM 回复后，提取记忆节点，调 Hermes 存储
3. **前端反馈**：收到 `memory` 事件时显示"💾 已记住" Toast


### 技术细节

- **检索**：`GET /api/v1/memories?query=用户消息` 返回相关记忆列表
- **注入格式**：
  ```
  相关记忆：
  - 用户喜欢冰美式不加糖
  - 用户明天下午 3 点开会
  ```
- **存储**：`POST /api/v1/memories` 存入 Hermes
- **记忆类型**：`fact` / `preference` / `event` / `task`


### 验证标准

- [ ] 用户说"我喜欢喝冰美式"，回复中提及"已记住"
- [ ] 第二次说"帮我推荐咖啡"，回复引用"您上次说喜欢冰美式"
- [ ] 前端出现"💾 已记住"提示


### 涉及文件

| 文件                                     | 操作                           |
| ---------------------------------------- | ------------------------------ |
| `server/src/services/hermesService.ts`   | 新建                           |
| `server/src/ws/handler.ts`               | 修改，集成检索和存储           |
| `client/src/voice/hooks/useVoiceChat.ts` | 监听 `memory` 事件，显示 Toast |


## 执行顺序

建议 **先做任务一（LLM）再做任务二（Hermes）**，因为 Hermes 的记忆内容需要来自真实 LLM 回复，模拟回复的内容不值得记忆。


## 你的选择

1. 只做 LLM 接入
2. 只做 Hermes 记忆
3. 两个都做，在一个分支
4. 两个都做，分开两个分支

告诉我你的选择，我给对应的完整代码。