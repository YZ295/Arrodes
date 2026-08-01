# 系统结构基线

## 清单

- `Arrodes/client/src/App.tsx`
- `Arrodes/client/src/main.tsx`
- `Arrodes/client/src/shared/events/EventBus.ts`
- `Arrodes/client/src/shared/stores/useUniverseStore.ts`
- `Arrodes/client/vite.config.ts`
- `Arrodes/server/src/config.ts`
- `Arrodes/server/src/index.ts`
- `Arrodes/server/src/routes/messages.ts`
- `Arrodes/server/src/routes/sessions.ts`
- `Arrodes/server/src/ws/handler.ts`
- `Arrodes/shared/types/index.ts`
- `assistant-x-openclaw/assistant_overlay/linux/flutter/generated_plugin_registrant.h`
- `assistant-x-openclaw/assistant_overlay/linux/runner/my_application.h`
- `assistant-x-openclaw/assistant_overlay/macos/Flutter/GeneratedPluginRegistrant.swift`
- `assistant-x-openclaw/assistant_overlay/macos/Runner/AppDelegate.swift`
- `assistant-x-openclaw/assistant_overlay/macos/Runner/MainFlutterWindow.swift`
- `assistant-x-openclaw/assistant_overlay/macos/Runner/Runner-Bridging-Header.h`
- `assistant-x-openclaw/assistant_overlay/macos/RunnerTests/RunnerTests.swift`
- `assistant-x-openclaw/assistant_overlay/windows/flutter/generated_plugin_registrant.h`
- `assistant-x-openclaw/assistant_overlay/windows/runner/flutter_window.cpp`
- `assistant-x-openclaw/assistant_overlay/windows/runner/flutter_window.h`
- `assistant-x-openclaw/assistant_overlay/windows/runner/main.cpp`
- `assistant-x-openclaw/assistant_overlay/windows/runner/resource.h`
- `assistant-x-openclaw/assistant_overlay/windows/runner/utils.cpp`
- `assistant-x-openclaw/assistant_overlay/windows/runner/utils.h`
- `assistant-x-openclaw/assistant_overlay/windows/runner/win32_window.cpp`
- `assistant-x-openclaw/assistant_overlay/windows/runner/win32_window.h`
- `assistant-x-openclaw/control_center/linux/flutter/generated_plugin_registrant.h`
- `assistant-x-openclaw/control_center/linux/runner/my_application.h`
- `assistant-x-openclaw/control_center/macos/Flutter/GeneratedPluginRegistrant.swift`
- `assistant-x-openclaw/control_center/macos/Runner/AppDelegate.swift`
- `assistant-x-openclaw/control_center/macos/Runner/MainFlutterWindow.swift`
- `assistant-x-openclaw/control_center/macos/RunnerTests/RunnerTests.swift`
- `assistant-x-openclaw/control_center/windows/flutter/generated_plugin_registrant.h`
- `assistant-x-openclaw/control_center/windows/runner/flutter_window.cpp`
- `assistant-x-openclaw/control_center/windows/runner/flutter_window.h`
- `assistant-x-openclaw/control_center/windows/runner/main.cpp`
- `assistant-x-openclaw/control_center/windows/runner/resource.h`
- `assistant-x-openclaw/control_center/windows/runner/utils.cpp`
- `assistant-x-openclaw/control_center/windows/runner/utils.h`
- `assistant-x-openclaw/control_center/windows/runner/win32_window.cpp`
- `assistant-x-openclaw/control_center/windows/runner/win32_window.h`
- `assistant-x-openclaw/scripts/enroll_speaker.py`
- `assistant-x-openclaw/scripts/export_aasist_onnx.py`
- `assistant-x-openclaw/scripts/hermes_provision.py`
- `assistant-x-openclaw/src/anti_spoof.py`
- `assistant-x-openclaw/src/assistants/__init__.py`
- `assistant-x-openclaw/src/assistants/custom_feedback.py`
- `assistant-x-openclaw/src/assistants/custom_tts.py`
- `assistant-x-openclaw/src/assistants/custom_visual.py`
- `assistant-x-openclaw/src/assistants/feedback.py`
- `assistant-x-openclaw/src/assistants/jarvis/__init__.py`
- `assistant-x-openclaw/src/assistants/jarvis/feedback.py`
- `assistant-x-openclaw/src/assistants/jarvis/tts.py`
- `assistant-x-openclaw/src/assistants/jarvis/tts_piper.py`
- `assistant-x-openclaw/src/assistants/jarvis/tts_zipvoice.py`
- `assistant-x-openclaw/src/assistants/jarvis/visual.py`
- `assistant-x-openclaw/src/assistants/lin_meimei/__init__.py`
- `assistant-x-openclaw/src/assistants/lin_meimei/feedback.py`
- `assistant-x-openclaw/src/assistants/lin_meimei/tts.py`
- `assistant-x-openclaw/src/assistants/lin_meimei/visual.py`
- `assistant-x-openclaw/src/assistants/tts.py`
- `assistant-x-openclaw/src/assistants/visual.py`
- `assistant-x-openclaw/src/audio.py`
- `assistant-x-openclaw/src/camera.py`
- `assistant-x-openclaw/src/dock_control.py`
- `assistant-x-openclaw/src/hermes_bridge.py`
- `assistant-x-openclaw/src/lifecycle.py`
- `assistant-x-openclaw/src/log_setup.py`
- `assistant-x-openclaw/src/main.py`
- `assistant-x-openclaw/src/media_pause.py`
- `assistant-x-openclaw/src/notify_bridge.py`
- `assistant-x-openclaw/src/openclaw_bridge.py`
- `assistant-x-openclaw/src/openclaw_bridge_websocket.py`
- `assistant-x-openclaw/src/tts.py`
- `assistant-x-openclaw/src/tts_vits.py`

## 入口

- `assistant-x-openclaw/src/main.py`

## 模块关系与数据流

三层结构：`Arrodes/client`（React + Vite 前端）、`Arrodes/server`（Express + WebSocket 后端）、`Arrodes/shared`（共享类型与常量，两端直接引用）。

### 后端（server/src/index.ts 为唯一入口）

- `index.ts` 创建 Express app 与 HTTP server，挂载 CORS、JSON 中间件，初始化 DB schema 与模型注册表。
- REST 路由（`/api/v1/*`）：`sessions`（会话 CRUD）、`messages`（按 sessionId 查消息）、`models`、`vision`、`memories`、`tts`、`skills`（GET 列出 / POST 注册自定义技能 / DELETE 删除）。
- WebSocket：`/v1/chat` 路径，`ws/handler.ts` 处理消息，数据流为：收消息 → 校验会话 → 存用户消息 → `MemoryGateway.retrieveContext` 检索记忆与画像 → 拼 LLM 上下文（画像 + 记忆 + 技能提示 + 最近 10 条历史）→ DeepSeek 流式生成（25s 超时）→ 技能调用循环（`<tool_call>` 解析，最多 3 轮）→ 存 AI 回复 → `processConversation` 提取新记忆 → 推送 complete/memory 事件。
- 配置（config.ts）：按 `$HOME/.arrodes/.env` → repo `.env` → `EXTRA_ENV_PATH` 顺序加载，密钥不进仓库。

### 前端（client/src）

- `main.tsx` / `App.tsx` 为入口；`shared/events/EventBus.ts` 提供全局事件总线（universe/voice/nav/app 命名空间事件）。
- `shared/stores/useUniverseStore.ts` 管理星球宇宙状态；`core/MessageChannel.ts`、`core/Pipeline.ts`、`pipeline/` 承载语音管道与阶段处理（intent/llm/memory/tts）。
- 组件层：`components/`（Avatar、ChatOverlay、SessionPanel、TTSControl 等）与 `modules/`（vision、voice）通过 EventBus 与 store 通信，WebSocket 收发在 MessageChannel 中完成。

### 依赖方向

- `shared/types` 被 client 与 server 共同 import，是唯一共享契约（会话/消息/记忆/意图/WS 协议类型）。
- server 内部依赖：routes → repositories（`db/`）→ services（`llmService`、`MemoryGateway`、`modelRegistry`）；skills 注册表被 index 与 ws handler 共用。
- 独立目录 `assistant-x-openclaw/*` 与 `Arrodes` 无代码级引用关系（仅同仓共存）。
