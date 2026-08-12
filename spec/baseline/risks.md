# 风险基线（2026-08-12 复核版）

## 大文件或高复杂度候选

- `TheFool/character_transparent.png`（2.9MB）、`the-fool.png`（1.6MB）、`character_no_bg.png`（0.9MB）
- `Arrodes/client/src/assets/arrodes_avatar.jpg`（238KB）
- client 主 bundle 约 1.19MB（构建告警 >500KB，建议 code-splitting）

## 安全、兼容与未知项

### 安全观察（记录现状，不承诺修复）

- 真实 API Key 走 `$HOME/.arrodes/.env`（用户级）；repo 内 `server/.env` 仅占位/默认值；`EXTRA_ENV_PATH` 可额外注入
- CORS 全开、无鉴权、无速率限制；若部署到公网，接口均可被匿名访问
- `POST /api/v1/skills` 允许动态注册 webhook 技能，服务端会 fetch 任意 URL（10s 超时）——存在 SSRF 面，注册仅存内存
- WS 消息无长度限制；LLM 上下文固定最近 10 条历史
- 桌面打包已不再内嵌 `server/.env`（2026-08-12 从 extraResources 移除）

### 兼容与未知项

- SQLite 直建表（initSchema 幂等 + 存量列补充），无迁移脚本；schema 变更需手工处理存量库
- 前端 `core/`（MessageChannel/Pipeline/PluginManager）与 `pipeline/`（voicePipeline）双套并存，实际活跃链路以 voicePipeline + MessageChannel 为准
- 历史遗留：早期基线引用 `assistant-x-openclaw/*` 路径已不存在，以实际 `Arrodes/*` 为准
- 打包分发：2026-08-12 已用 electron-builder 26.15.3 + electron 43.4.0 成功构建 NSIS 安装包（release3/Arrodes-Setup-1.0.0.exe）；安装包未实机安装运行验证
- 多平台未验证（仅 Windows）
- 依赖审计：desktop 依赖链 2026-08-12 升级 electron-builder 后 0 已知漏洞
- 打包体积：server/node_modules 全量（含 devDependencies，116.7MB）进包，后续可裁剪；应用图标为默认 Electron 图标
