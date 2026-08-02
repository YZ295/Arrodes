# 行为规格：desktop-shell

## ADDED Requirements

### REQ-DESKTOP_SHELL-001：Electron 壳入口必须存在

- 根 `package.json` 必须声明 `main` 指向 `electron/main.js`，提供 `desktop` script 运行 Electron
- `electron/` 目录必须包含主进程代码，devDependency 必须包含 `electron`

#### Scenario：入口可用

- **前置条件**：根目录已安装依赖
- **当**：执行 `npm run desktop`
- **则**：Electron 启动并加载 `electron/main.js`，应用进入壳启动流程

### REQ-DESKTOP_SHELL-002：壳必须以纯 Node 模式 spawn server

- 壳必须使用 `child_process.spawn(process.execPath, [serverEntry], ...)` 拉起 server，其中 `serverEntry` 为 `server/dist/index.js` 的绝对路径，且环境变量必须包含 `ELECTRON_RUN_AS_NODE=1`
- spawn 的 `cwd` 必须为 `server` 目录绝对路径
- 环境变量必须覆盖：`PORT=3001`、`NODE_ENV=production`、`DB_PATH`（绝对路径，见 REQ-DESKTOP_SHELL-006）
- 子进程 stdout/stderr 必须转发到主进程 console

#### Scenario：以 Node 模式启动 server

- **前置条件**：`server/dist/index.js` 已构建存在
- **当**：壳执行 spawn
- **则**：Electron 可执行文件以纯 Node 模式运行 ESM 入口（Node 22 原生支持 ESM），不经过 Electron 模块系统，无需 loader 参数

### REQ-DESKTOP_SHELL-003：健康就绪后才开窗

- 壳必须轮询 `http://127.0.0.1:3001/api/health`，仅当返回 HTTP 200 后才创建 BrowserWindow 并加载 `http://localhost:3001`
- 轮询超时（10 秒）必须终止 server 子进程、弹窗报错并退出

#### Scenario：server 就绪

- **前置条件**：server 已 spawn，3001 可访问
- **当**：`/api/health` 返回 200
- **则**：创建 BrowserWindow 并加载 `http://localhost:3001`

#### Scenario：server 未就绪

- **前置条件**：server 启动失败或超时
- **当**：10 秒内 health 未返回 200
- **则**：弹窗显示错误，终止 server 子进程，应用退出

### REQ-DESKTOP_SHELL-004：端口占用必须提前报错

- 壳在 spawn 之前必须探测 127.0.0.1:3001，若端口已被占用必须弹窗报错并退出，不得继续启动

#### Scenario：端口被占用

- **前置条件**：3001 已被其他进程监听
- **当**：壳启动
- **则**：弹窗提示端口占用，应用退出，不 spawn server

### REQ-DESKTOP_SHELL-005：退出时回收子进程

- 所有窗口关闭时，壳必须终止 server 子进程（SIGTERM，超时后 SIGKILL）再退出
- server 子进程意外退出时，壳必须弹窗提示并退出
- `before-quit` 必须兜底终止子进程，避免残留

#### Scenario：关窗退出

- **前置条件**：窗口已打开，server 在运行
- **当**：用户关闭所有窗口
- **则**：server 子进程收到 SIGTERM 并被回收，应用退出，无残留进程

#### Scenario：server 崩溃

- **前置条件**：壳运行中
- **当**：server 子进程非预期退出
- **则**：壳弹窗提示 server 已退出，并终止自身退出流程

## CHANGED Requirements

### REQ-DESKTOP_SHELL-006：server 生产模式必须托管 client 构建产物

- server 在 `NODE_ENV=production` 时必须托管 `client/dist` 静态文件（目录默认为 `server` 上一级 `client/dist` 的绝对路径，`CLIENT_DIST` 环境变量可覆盖）
- 对非 `/api`、`/v1/chat` 前缀的 GET 请求，若未命中静态文件则回退返回 `index.html`（SPA fallback）
- `/api/*` 与 `/v1/chat` 不得回退，保持现有 API/WS 行为不变
- `NODE_ENV !== 'production'`（development）时保持现状：不托管静态文件，vite dev server 照旧

#### Scenario：生产模式静态托管

- **前置条件**：`client/dist` 已构建，`NODE_ENV=production`，server 启动于 3001
- **当**：请求 `GET /`
- **则**：返回 `client/dist/index.html`，HTTP 200

#### Scenario：SPA fallback

- **前置条件**：同上
- **当**：请求 `GET /some/deep/route`（非静态资源、非 API）
- **则**：返回 `index.html`，HTTP 200

#### Scenario：API 不回退

- **前置条件**：同上
- **当**：请求 `GET /api/v1/sessions`
- **则**：走现有 API 路由，返回 `{ sessions }`；不存在的 API 路径返回 404，不回退 index.html

## REMOVED Requirements

无。
