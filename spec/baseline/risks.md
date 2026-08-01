# 风险基线

## 大文件或高复杂度候选

- `assistant-x-openclaw/assistant_overlay/images/logo.png`
- `assistant-x-openclaw/assistant_overlay/macos/Runner/Assets.xcassets/AppIcon.appiconset/icon-256@2x.png`
- `assistant-x-openclaw/assistant_overlay/macos/Runner/Assets.xcassets/AppIcon.appiconset/icon-512@1x.png`
- `assistant-x-openclaw/assistant_overlay/macos/Runner/Assets.xcassets/AppIcon.appiconset/icon-512@2x.png`
- `assistant-x-openclaw/data/voices/jarvis_start_up.mp3`
- `assistant-x-openclaw/data/voices/processing_jarvis.wav`
- `assistant-x-openclaw/docs/jarvis.png`

## 安全、兼容与未知项

### 安全观察（仅记录现状，不修复）

- 真实 API Key 走 `$HOME/.arrodes/.env`（用户级），repo 内 `.env` 仅占位/默认值；`EXTRA_ENV_PATH` 可额外注入。密钥不出现在代码与日志中。
- CORS 全开（`app.use(cors())` 无白名单），所有 HTTP 与 WS 接口无鉴权、无速率限制；若部署到公网，接口均可被匿名访问。
- `POST /api/v1/skills` 允许动态注册 webhook 技能，服务端会 `fetch` 任意 URL（10s 超时）——存在 SSRF 面，且注册仅存内存，重启即失。
- WS 消息无长度限制，超大 payload 会整体进入 `JSON.parse` 与 LLM 上下文。
- LLM 上下文固定取最近 10 条历史，长会话存在上下文截断，属设计行为而非缺陷。

### 兼容与未知项

- `system-map.md` 与 `risks.md` 引用的大量 `assistant-x-openclaw/*` 路径在当前工作区（`E:/project/Crow5/Arrodes`）与 `E:/project/Crow5` 根目录下均不存在——该目录可能已迁移或删除，基线中这些条目属于历史遗留引用，无法验证其内容；后续处理以实际存在的 `Arrodes/*` 为准。
- DB 为 SQLite 直建表（`initSchema`），无迁移脚本；schema 变更需手工处理存量库。
- 前端存在 `pipeline/`（语音管道）与 `core/`（MessageChannel/Pipeline/PluginManager）等多套并存架构，实际活跃链路需按具体功能确认。
