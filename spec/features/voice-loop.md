# 语音闭环 (Voice Loop)

## 概述
覆盖录制 → 转写 → 意图识别 → 发送 → 流式响应 → TTS 播放的端到端数据流。

## 组件清单
- `useAudioRecorder` — MediaRecorder 封装，输出音频 Blob
- `useSpeechToText` — Web Speech API（zh-CN），支持 interim/final
- `intentDetector` — 本地意图匹配（new_session / switch_session / delete_session 等）
- `useVoiceChat` — WebSocket 生命周期 + 消息状态机 + TTS 触发

## 数据流
1. 用户点击麦克风 → `startRecording()` → `VOICE_RECORDING_START`
2. 再次点击 → `stopRecording()` → 获取 Blob → 启动 STT
3. STT 完成 → `sendMessage(text, true)` → 意图检测
4. 本地意图 → 直接回复 + `VOICE_INTENT_ACTION`（不上报服务端）
5. 服务端意图 → WS `message` 帧 → 服务端保存 → chunk / complete
6. `complete` → `speakReply()` 触发 `SpeechSynthesis` → `VOICE_REPLY_COMPLETE`

## 降级策略
- 无麦克风权限：显示提示，保留文本输入通道
- 无网络：乐观添加消息 + 离线占位回复
- 浏览器不支持 SpeechRecognition：降级为 `[语音消息]` 占位文本
- STT 无结果：静默重试 1 次，仍失败则发送占位文本

## 事件总线
`EventBus` 串联宇宙系统与语音系统：星球点击打开面板、意图触发导航切换。
