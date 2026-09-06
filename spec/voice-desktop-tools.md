# 业务规范：voice-desktop-tools（桌面操控 × 语音交互 × 浏览器/MCP）

- 状态：accepted（用户 2026-08-13 确认决策 1A 2C 3A）
- 决策依据：[decisions.md](decisions.md)
- 关联参考：Daisy-Voice-Agent（一按即说/系统控制/站内搜索）、HoloJarvis（本地 STT/显式记忆/状态联动/MCP）、Obsidian 每日简报 2026-08-12（浏览器自动化是代理最大赛道、MCP 生态标准）

## 目标

给阿罗德斯补齐三类能力，全部服务端优先、不与 Hermes 人物卡未提交文件冲突：

1. **M1 桌面操控**：应用/窗口控制、文本键入、快捷键、音量/媒体、剪贴板、截图、锁屏、系统状态；全部经安全沙箱（黑名单/超时/截断）与分级授权（低风险自动、高风险确认）。
2. **M2 语音交互**：服务端 STT 本地引擎切换（在线 SiliconFlow 默认，可一键切 faster-whisper 本地侧车）；唤醒词/一按即说 UI 待 Hermes 文件提交后落地（服务端能力先行）。
3. **M3 浏览器与生态**：打开 URL、站内搜索直达（B站/知乎/百度等）；MCP 客户端桥（按环境配置连接外部 MCP server）。

## 非目标

- 不做 Hermes 人物卡相关改动（App.tsx/PanelView.tsx/MemoryPanel.tsx/EventBus.ts/llmService.ts/ProfilePanel.tsx/constants）
- 不做 macOS/Linux 支持（仅 Windows；Daisy 为 macOS 专用，只借鉴交互模式）
- 不做全息 HUD/3D 粒子桌宠（TheFool 状态色联动已有）
- 不做浏览器完整 CDP 自动化（本轮仅打开/搜索直达；完整操控留后续）
- 不改主循环、WS 协议与记忆系统结构

## 验收标准（全部需测试证据）

- M1：10+ 桌面技能注册可用；高风险操作先产生待确认项，回复「确认/取消」后执行或拒绝，不经过 LLM；全部操作有开关（DESKTOP_TOOLS=off 整体关闭）；winops 输出结构化 JSON；单元测试覆盖分类/队列/匹配/命令构建。
- M2：`GET /api/v1/stt/mode` 返回当前模式；`POST /api/v1/stt/mode` 可切换 online/local/auto 并持久化；transcribe 按模式路由（本地侧车不可用时 local 模式明确报错、auto 回退在线）；模式选择逻辑有测试。
- M3：open_url/web_search_direct 正确构造 URL 并用默认浏览器打开（winops 打开）；MCP 客户端可对假 MCP server 完成 initialize/tools/list/tools/call，超时与错误有测试。
- 回归：server 全量 vitest 通过；server typecheck 通过；client build 通过（含 Hermes 未提交改动）。

## 风险与开关

| 风险 | 缓解 |
|---|---|
| 语音误听触发破坏性操作 | 高风险操作一律确认（D3=A）；确认消息短句全匹配，避免误拦截 |
| 剪贴板被覆盖 | clipboard_set 高风险；type_text 用剪贴板+粘贴，操作前保存原剪贴板文本 |
| PowerShell 命令注入 | payload 经 spawn 参数直传（无 shell），脚本内只做 JSON 解析；不拼接用户输入进命令字符串 |
| 本地 STT 环境缺失 | sidecar 缺依赖时 health 报错，auto/online 模式自动回退在线 |
| 与 Hermes 文件冲突 | 本轮所有改动限定 server/（ws/handler.ts、index.ts、新增 services/skills/routes/scripts）与新增 spec 文档 |

## Tickets

- T1 actionGate 分级授权服务（分类/待确认队列/确认匹配）＋测试
- T2 winops PowerShell 操控层（winops.ps1 + winops.ts 包装）＋测试
- T3 desktop 技能族（14 个技能注册）＋接线 index.ts
- T4 actions REST 路由 + WS 确认拦截（ws/handler.ts）
- T5 browser 技能（open_url / web_search_direct）＋测试
- T6 STT 模式切换（sttSettings + sttService 路由 + stt_sidecar.py）＋测试
- T7 MCP 客户端桥（mcpClient + mcp 技能 + 假 server 测试）
- T8 全量回归：server test + typecheck + client build + 验证记录

## 实施状态（2026-08-13）

- [x] T1–T8 全部完成（服务端实现；客户端确认弹窗/唤醒词 UI 因 Hermes 未提交文件而延后）

## 验证记录（2026-08-13 新鲜证据）

### 单元/集成测试

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm --prefix Arrodes/server run test` | 通过 | 40 文件 / 242 用例全绿（新增 actionGate 18、winops 6、browser 5、sttService 7、sttSettings 3、mcpClient 4、executor 直通 2） |
| `npm --prefix Arrodes/server run typecheck` | 通过 | tsc --noEmit 退出码 0 |
| `npm --prefix Arrodes/server run build` | 通过 | tsc 构建成功 |
| `npm --prefix Arrodes/client run build` | 通过 | vite build 成功（含 Hermes 未提交人物卡改动，验证无编译冲突；1.19MB bundle 为存量警告） |

### 真机集成冒烟（真实 PowerShell + 真实服务）

| 项 | 结果 | 证据 |
|---|---|---|
| winops system-stats | 通过 | `{cpuPercent:20, memTotalGB:15.3, memUsedGB:9.8}` |
| winops list-windows | 通过 | 返回 7 个可见窗口 |
| winops screenshot | 通过 | 609,702 字节 PNG 落盘 |
| winops get-foreground | 通过 | 前台窗口 ChatGPT (pid 26168) |
| winops clipboard-get | 通过 | 返回文本 |
| 服务端技能注册 | 通过 | 19/19 新技能在 `/api/v1/skills` 可见，总数 44 |
| 授权配置 API | 通过 | `/api/v1/actions/config` 返回风险表（高风险 7 项需确认） |
| STT 模式持久化 | 通过 | 默认 online → POST local → GET local → 复位 online |

### 未真机验证项（诚实标注）

- volume set（CoreAudio COM 路径）与 type-text/send-hotkey/media/close-window/focus-window：会改变用户系统状态，未在本次会话中触发；逻辑经代码审查，脚本已通过 PowerShell 解析器与真实进程调用验证
- faster-whisper 本地 STT：侧车脚本就绪，依赖本机 Python 环境安装 faster-whisper（health 会如实报告）；当前默认 online 不受影响
- MCP 外部 server：仅用假 server 验证协议；真实 MCP server 需配置 MCP_SERVERS 后联调

### 打包说明

- `desktop/package.json` extraResources 已补充 `scripts/**`，确保 winops.ps1 与 stt_sidecar.py 进入安装包；打包分发未重新执行（时间约束），下次 dist 时生效
