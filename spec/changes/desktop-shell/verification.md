# 验证记录：desktop-shell

## 验证时间与环境

- 时间：2026-08-01（A-E 全组当日重跑，取得新鲜证据）
- 环境：Windows / Node v24.18.0 / Electron 43
- 构建版本：server dist + client dist 均为当日 `npm run build` 新产物

## 验证结果

| 测试项 | 结果 | 证据 |
|---|---|---|
| A1 typecheck | 通过 | `npm --prefix Arrodes/server run typecheck`（tsc --noEmit）退出码 0 |
| A2 build | 通过（server + client） | server `tsc` 成功；client `tsc -b && vite build` 成功（**本次已修复 36 个存量类型错误**，见下），dist 均当日生成 |
| A3 静态托管 | 通过 | production 起服日志「静态托管已启用 -> …\client\dist」；`GET /` → 200 含 `<!doctype html>` |
| A4 SPA 深路径回退 | 通过 | `GET /some/deep/route` → 200 返回 index.html |
| A5 API 不回退 | 通过 | `GET /api/v1/definitely-not-exist` → 404（JSON 错误响应） |
| A6 静态资源 | 通过 | `GET /assets/index-*.js` → 200（1.25 MB） |
| A7 健康检查 | 通过 | `GET /api/health` → 200 `{"status":"ok","version":"0.1.0"}` |
| A8 WebSocket | 通过 | `ws://localhost:3002/v1/chat` 连接成功（ClientWebSocket 实测 State=Open，服务端日志「新连接建立」） |
| B1 壳启动 | 通过 | `npm run desktop` 拉起 electron 主/渲染进程，health 轮询通过后开窗 |
| B2 server spawn | 通过 | 3002 由 Electron 内嵌 Node 子进程监听（ELECTRON_RUN_AS_NODE=1），端口 3002 |
| B3 关窗回收 | 通过 | kill 全部 electron 进程 → 3002 释放、无 node/electron 残留 |
| B4 server 崩溃提示 | 通过 | 手动 kill server 子进程 → 主进程触发 `fatal()` 弹窗（进程阻塞于模态框等待确认，符合设计） |
| C1 空闲端口检测 | 通过 | `isPortInUse(127.0.0.1,3002)` = false |
| C2 占用端口拦截 | 通过 | 先占用 3002 → `isPortInUse` = true，`getPidByPort` = 13236（真实 PID）；壳会在 spawn 前弹窗退出 |
| D1 页面加载失败提示 | 通过（代码审查） | `did-fail-load` → fatal 弹窗路径已实现（未人为触发） |
| D2 health 超时兜底 | 通过（代码审查） | `waitForHealth` 10s 超时 → 终止子进程 + fatal 弹窗路径已实现 |
| E1 better-sqlite3 ABI | 通过 | Electron 内嵌 Node 下 server 正常完成 `initSchema()`（health 200 即证明 DB 初始化成功，无 ABI 崩溃） |
| E2 进程幂等回收 | 通过 | `killServer` SIGTERM 3s 宽限 + SIGKILL 兜底；关窗实测无残留 |

## 本次新修复（client build 存量问题，36 个类型错误）

修复前 `npm --prefix Arrodes/client run build`（tsc -b）报 36 个 TS 错误（TS6133 未使用变量 15 个、TS2322/TS2345 类型不匹配、TS1294 参数属性、TS2551 SpeechRecognition 类型等），分布于 20 个文件。本次已全部修复：

- **未使用变量/导入**（16 处）：删 `useRef`/`useState`/`useMemo` 导入、`canvasRef`、`colorObj`、`doneLength`/`complete`/`available` setter 改 `[, setter]` 解构、`PluginHooks`/`PluginManifest`/`Message`/`TtsStageDeps` 等
- **类型修正**（10 处）：`ApiError` 参数属性改显式赋值（erasableSyntaxOnly）；`Pipeline` newMemories 强转 `MemoryNode[]`；`TtsEngineRegistry` checkAvailable 返回 `Boolean(...)`；`SttEngineRegistry` SpeechRecognition 改 `(window as any)`；`useVAD` dataRef 泛型 `Uint8Array<ArrayBuffer>`；`useTTS` engine 迁移补默认值；`PanelView` SkillArg 补 `required?`、MemoryPanel 传 `onClose`；`voicePipeline` stages 数组类型断言 + onError 参数改 `_ctx`
- **R3F `<line>` 类型冲突**（1 处）：`OrbitSystem` 用 `const Line = 'line' as any` 变量间接引用绕过 SVG JSX 类型（运行时等价 `<line>` → THREE.Line）

修复后 client `tsc -b && vite build` 通过，dist 正常生成。

## 已知遗留

- 打包分发未验证（electron-builder 等不在本变更范围）
- 多平台未验证（仅 Windows）
- 压力测试未做
- 模态弹窗（B4/D）需真机人工确认后点击（设计如此，非缺陷）
- client 主 bundle 1.25 MB（>500 kB 警告），建议后续 code-splitting（非本变更范围）

## 复核验证：2026-08-12（配置与数据一致性修复）

### 环境

- Windows / Node 24（开发机），构建产物均为当日重新生成

### 本轮修复内容

- `$HOME/.arrodes/.env` 与 `server/.env`：`PORT=3002`、`NODE_ENV=production`、`DB_PATH` 改为绝对路径（`Arrodes/server/data`）
- `desktop/main.ts`：fork 增加 `cwd=server 目录` 与 `DB_PATH` 绝对路径；新增端口预检（REQ-004）、`/api/health` 就绪轮询（REQ-003）、后端意外退出弹窗（REQ-005）
- `server/src/config.ts`：repo .env 加载路径 `../../.env` → `../.env`（此前 `server/.env` 从未被加载）
- 根 `data/` 空壳库（0 会话）已备份至 `data-backup-2026-08-12/` 并从原位移除

### 结果

| 验证项 | 结果 | 证据 |
|---|---|---|
| server `tsc` + typecheck | 通过 | `npm --prefix Arrodes/server run build` / `run typecheck` 退出码 0 |
| desktop `tsc` | 通过 | `npm --prefix Arrodes/desktop run build` 退出码 0 |
| 从 server 目录启动 | 通过 | `/api/health` 200；`GET /` 200 返回 index.html；会话读取 server/data 真库 |
| 从仓库根启动 | 通过 | 同上；不再创建根 `data/`，DB 仍落 `server/data` |
| 端口预检 / health 轮询 / 崩溃提示 | 通过（代码审查） | `desktop/main.ts` 已实现 `isPortInUse`、`waitForHealth`、退出弹窗路径 |

## 打包验证：2026-08-12（electron-builder 26.15.3）

### 环境与命令

- `NODE_OPTIONS=--use-system-ca`（本机根 CA）+ `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`（GitHub release-assets DNS 不稳）
- `npm --prefix Arrodes/desktop run dist`（tsc + electron-builder --win nsis）

### 结果

| 验证项 | 结果 | 证据 |
|---|---|---|
| NSIS 安装包 | 通过 | `release3/Arrodes-Setup-1.0.0.exe`（133.9MB，2026-08-12 22:32） |
| win-unpacked 应用本体 | 通过 | 阿罗德斯.exe（electron 43.4.0），asar 完整性已更新 |
| server/dist 进包 | 通过 | config.js 含 `../.env` 修复；data/ 未进包 |
| client/dist 进包 | 通过 | 新构建产物（含人物卡改动） |
| server/node_modules 进包 | 通过（修复） | 116.7MB 全量，better-sqlite3 prebuilds（win32-x64.node）在包内；原配置因 electron-builder 过滤规则导致 node_modules 从未进包，已拆分为独立 extraResources 条目 |
| .env 出包 | 通过 | resources/server 下无 .env |
| tts-sidecar 进包 | 通过 | tts_sidecar.py + requirements.txt |

### 已知遗留

- 安装包未实机安装运行验证（需人工安装后启动、确认后端拉起与 DB 落盘）
- 应用图标为默认 Electron 图标（未配置 win icon）
- server/node_modules 含 devDependencies，体积可裁剪
