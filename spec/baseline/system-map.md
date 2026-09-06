# 系统结构基线（2026-08-12 复核版）

## 清单

### 后端（Arrodes/server/src）

- `index.ts`（Express + WS 入口）、`config.ts`（env 加载：用户级 → server/.env → EXTRA_ENV_PATH）
- `db/`：connection、schema、session-repo、message-repo、memory-repo、usage-repo、workspace-repo
- `services/`：llmService、modelRegistry、MemoryGateway、usageService、promptShell、ttsService、cosyVoiceProxy、visionService、computerService、explicitMemory、petStatus、mainloop
- `harness/`：harness（注册表/意图路由/重试/任务日志）、agent（定义）、agents/main、agents/memory、agents/dev
- `skills/`：registry、builtin、computer、web、reminder、weather、devworkflow
- `routes/`：sessions、messages、models、vision、memories、tts、usage、stt、workspace、workspaces、pet、promptShell
- `ws/handler.ts`、`middleware/zod-validate`、`workspace/`（connectors、memory-hub）

### 前端（Arrodes/client/src）

- 入口：`App.tsx` / `main.tsx` / `index.css`
- `core/`：MessageChannel、Pipeline、PluginManager
- `pipeline/`：voicePipeline + stages（intent/llm/memory/tts）
- `voice/`：hooks（useVoiceChat、useTTS、useSpeechToText、useAudioRecorder、useSessionManager、useVoiceRecorder）、utils/intentDetector
- `modules/voice`：TtsEngineRegistry、SttEngineRegistry、useVAD、AudioContextManager；`modules/vision`
- `shared/`：events/EventBus、stores、utils/apiClient
- `store/workspaceStore`；`components/`（Sidebar、ChatOverlay、PanelView、MemoryPanel、ProfilePanel、Subtitle 等）；`universe/`（3D 星球）

### 共享契约（Arrodes/shared/types）

- `index.ts`（Session/Message/Memory/Intent/Voice/WS 协议）、`pipeline.ts`、`plugin.ts`

### 桌面壳（Arrodes/desktop）

- `main.ts`（编译到 `dist/main.js`）：fork 后端、端口预检、health 轮询、窗口生命周期、退出回收

## 入口

- 后端：`Arrodes/server/src/index.ts`
- 桌面壳：`Arrodes/desktop/main.ts`（编译产物 `desktop/dist/main.js` 为根 package.json `main`）
- 语音侧车：`Arrodes/tts-sidecar/tts_sidecar.py`（FastAPI :12001，懒启动）
- 桌宠：`TheFool/desktop_pet.py`（PySide6，轮询 `/api/v1/pet/status`）

## 模块关系与数据流

三层结构：`Arrodes/client`（React + Vite 前端）、`Arrodes/server`（Express + WebSocket 后端）、`Arrodes/shared`（唯一共享契约，两端直接引用）。

- 依赖方向：shared ← client/server；server 内部 routes → db/repositories → services；skills 注册表被 index 与 harness 共用
- WS 主链路：MessageChannel → ws/handler → Harness → Agent（main/memory/dev）→ LLM/技能 → 记忆
- TTS：client useTTS → `/api/v1/tts/synthesize` → ttsService（串行队列 + 重试）→ cosyVoiceProxy（懒启动 sidecar）→ CosyVoice2
- 主循环：mainloop 30s tick → 到期提醒推送 + 每 3 次 tick 记忆整理
- 独立目录 `TheFool/` 与 Arrodes 无代码级引用；`assistant-x-openclaw/*` 为历史遗留引用（目录已不存在）
