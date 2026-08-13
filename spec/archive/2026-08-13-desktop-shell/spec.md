# 行为规格：desktop-shell（对齐实现版）

> 2026-08-12 复核后与实现对齐；此前版本描述的 spawn/3001/`electron/` CJS 目录已被实现演进取代。

## ADDED Requirements

### REQ-DESKTOP_SHELL-001：桌面壳入口必须存在且可一键启动

- 根 package.json 必须声明 `main` 指向 `desktop/dist/main.js`，提供 `desktop` script；`desktop` script 必须先构建桌面壳（`desktop:build`）再运行 Electron
- `desktop/` 目录包含主进程源码（TypeScript，编译到 dist）；devDependency 包含 `electron`（^43.2.0）

#### Scenario：入口可用

- **前置条件**：根目录已安装依赖
- **当**：执行 `npm run desktop`
- **则**：先编译 `desktop/main.ts`，Electron 启动并加载 `desktop/dist/main.js`，进入壳启动流程

### REQ-DESKTOP_SHELL-002：壳必须以纯 Node 模式 fork 后端

- 壳使用 `child_process.fork(serverEntry)`，`serverEntry` 为 `server/dist/index.js` 绝对路径，环境变量必须包含 `ELECTRON_RUN_AS_NODE=1`
- fork 的 `cwd` 必须为 server 目录绝对路径
- 环境变量必须覆盖：`PORT=3002`、`NODE_ENV=production`、`DB_PATH`（绝对路径，默认 `server/data`，可用 `ARRODES_DB_PATH` 覆盖）、`NODE_OPTIONS=''`（清除宿主注入）
- 子进程 stdout/stderr 必须转发到主进程 console

#### Scenario：以 Node 模式启动后端

- **前置条件**：`server/dist/index.js` 已构建
- **当**：壳执行 fork
- **则**：Electron 可执行文件以纯 Node 模式运行 ESM 入口，不经过 Electron 模块系统

### REQ-DESKTOP_SHELL-003：健康就绪后才开窗

- 壳必须轮询 `http://127.0.0.1:3002/api/health`，仅当返回 HTTP 200 后才创建 BrowserWindow 并加载 `http://localhost:3002`
- 轮询超时（30 秒）必须终止后端子进程、显示启动错误并退出

#### Scenario：后端就绪

- **前置条件**：后端已 fork，3002 可访问
- **当**：`/api/health` 返回 200
- **则**：创建 BrowserWindow 并加载 `http://localhost:3002`

### REQ-DESKTOP_SHELL-004：端口占用必须提前报错

- 壳在 fork 之前必须探测 127.0.0.1:3002，若端口已被占用必须报错退出，不得继续启动

#### Scenario：端口被占用

- **前置条件**：3002 已被其他进程监听
- **当**：壳启动
- **则**：报错退出，不 spawn 后端

### REQ-DESKTOP_SHELL-005：退出时回收子进程

- 所有窗口关闭时，壳必须终止后端子进程再退出
- 后端子进程意外退出（非主动关闭）时，壳必须弹窗提示并退出
- `before-quit` 必须兜底终止子进程，避免残留；主动退出置位后不得触发"意外退出"弹窗

#### Scenario：关窗退出

- **前置条件**：窗口已打开，后端在运行
- **当**：用户关闭所有窗口
- **则**：后端进程被回收，应用退出，无残留进程

#### Scenario：后端崩溃

- **前置条件**：壳运行中
- **当**：后端子进程非预期退出
- **则**：壳弹窗提示后端已退出，并退出应用

### REQ-DESKTOP_SHELL-006：server 生产模式必须托管 client 构建产物

- server 在 `NODE_ENV=production` 时必须托管 `client/dist`（默认 `server` 上级 `client/dist` 绝对路径，`CLIENT_DIST` 可覆盖）
- 对非 `/api`、`/v1/chat` 前缀的 GET 请求，若未命中静态文件则回退返回 index.html（SPA fallback）
- `/api/*` 与 `/v1/chat` 不得回退，保持现有 API/WS 行为不变
- `NODE_ENV !== 'production'` 时不托管静态文件，vite dev 工作流不变
- repo 级 `.env` 从 `server/.env` 加载（config.ts 解析 `../.env`）

#### Scenario：生产模式静态托管

- **前置条件**：`client/dist` 已构建，`NODE_ENV=production`，server 启动于 3002
- **当**：请求 `GET /`
- **则**：返回 `client/dist/index.html`，HTTP 200

#### Scenario：SPA fallback

- **前置条件**：同上
- **当**：请求 `GET /some/deep/route`（非静态资源、非 API）
- **则**：返回 index.html，HTTP 200

#### Scenario：API 不回退

- **前置条件**：同上
- **当**：请求 `GET /api/v1/sessions`
- **则**：走现有 API 路由，返回 `{ sessions }`；不存在的 API 路径返回 404，不回退 index.html

## CHANGED Requirements

### REQ-DESKTOP_SHELL-007：端口与数据目录约定

- 统一端口 3002（config 默认、前端 WS 默认、vite proxy、桌面壳）
- DB 数据目录统一 `server/data`（绝对路径）；历史漂移产生的根 `data/` 空壳库已备份至 `data-backup-2026-08-12/` 并移出

## REMOVED Requirements

无（原文档中 3001/spawn/`electron/` CJS 目录描述已由本版取代）。
