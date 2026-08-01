# 技术设计：desktop-shell

## 当前状态

- 仓库根 `E:\project\Crow5\Arrodes`，代码在 `Arrodes/` 子目录：`server/`（ESM，`"type": "module"`，tsc 构建到 `dist/index.js`）与 `client/`（Vite + React，构建到 `dist/`）
- server 配置（`server/src/config.ts`）：端口默认 3001（`PORT` env 覆盖），`DB_PATH` 默认 `'./data'`（相对 cwd），`NODE_ENV` 默认 `development`；`/api/health` 存在，WS 挂载于 `/v1/chat`，`cors()` 全开
- client 的 API 全部走相对路径 `/api/v1`，WS 默认 `localhost:3001`，因此托管在同一 origin 下无需改动
- 根 `package.json` 仅有 `typescript` devDependency，无 `main` 字段、无 electron
- server 依赖 better-sqlite3 v13（原生模块，N-API 构建）

## 方案与数据流

### 启动序列

```
app.whenReady()
  → 端口预检（net.connect 127.0.0.1:3001，成功=占用 → 弹窗退出）
  → spawn(process.execPath, [server/dist/index.js 绝对路径], {
       cwd: server 目录绝对路径,
       env: { ...process.env,
              ELECTRON_RUN_AS_NODE: '1',
              PORT: '3001',
              NODE_ENV: 'production',
              DB_PATH: <绝对路径> },
       stdio: ['ignore', 'pipe', 'pipe'] })
  → stdout/stderr 转发主进程 console
  → 轮询 GET http://127.0.0.1:3001/api/health（间隔 200ms，超时 10s）
      → 200：创建 BrowserWindow，loadURL http://localhost:3001
      → 超时：kill 子进程，dialog.showErrorBox，app.quit()
```

### 退出序列

```
window-all-closed → killServer()（SIGTERM → 3s 后 SIGKILL）→ app.quit()
server 'exit' 事件（非预期）→ dialog.showErrorBox + 清理 + app.quit()
app 'before-quit' → 兜底 killServer()（幂等，防残留）
```

### 模块结构（electron/ 目录，CJS，因为根 package.json 无 "type":"module"）

- `electron/main.js`：app 生命周期、BrowserWindow、编排 spawn/轮询/退出
- `electron/server-process.js`：`spawnServer(serverDir, port, dbPath)` 返回子进程句柄 + stdout/stderr 转发；`killServer(proc)` 幂等终止
- `electron/port-check.js`：`isPortInUse(host, port) => Promise<boolean>`（net.connect 探测）
- `electron/health.js`：`waitForHealth(url, { interval, timeout }) => Promise<void>`（fetch 轮询）

### ESM 规避方案（关键决策）

- server 是 ESM 入口（`dist/index.js`），且 Electron 内嵌 Node ≥ 22 原生支持 ESM 入口
- 采用 `child_process.spawn(process.execPath, [entry], { env: { ELECTRON_RUN_AS_NODE: '1' } })`：Electron 可执行文件以**纯 Node 模式**运行，直接加载 ESM 文件，不经过 Electron 模块系统，因此**不需要任何 --loader hack**
- 不用 `child_process.fork`：fork 默认继承 `process.execPath` 且携带 IPC 通道，在 Electron 环境下 loader 初始化路径有兼容问题，spawn 更可控

### DB_PATH 转绝对路径（关键决策）

- 默认：`path.resolve(serverDir, 'data')`，即 `Arrodes/server/data`
- 若存在 `DB_PATH` env 值，也一律 `path.resolve(serverDir, value)` 转绝对路径后再传给子进程
- 原因：spawn 的 cwd 与 Electron 启动目录不同，相对路径会落到错误位置；绝对路径保证数据库文件稳定

## 接口与兼容性

### server 侧新增（REQ-DESKTOP_SHELL-006）

- 在 `server/src/index.ts` 中：当 `NODE_ENV === 'production'` 时挂载
  1. `express.static(clientDist)`，`clientDist = path.resolve(dirname, '../client/dist')`（`CLIENT_DIST` env 可覆盖）
  2. SPA fallback：对 `GET` 且路径不以 `/api` 或 `/v1/chat` 开头的请求，若未命中静态文件则 `res.sendFile(index.html)`
- development 下不挂载，vite dev 工作流不变

### 对外契约不变

- 所有 `/api/*` 与 `/v1/chat` 行为、状态码、WS 协议完全不变
- 端口仍为 3001（`PORT` env 可覆盖，壳固定传 3001）

## 配置、常量与依赖注入

| 项 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `'3001'` | 壳 spawn 时固定传入 |
| `NODE_ENV` | `'production'` | 壳 spawn 时固定传入，触发静态托管 |
| `DB_PATH` | `server/data` 绝对路径 | 壳显式传入绝对路径 |
| `CLIENT_DIST` | `server 上级/client/dist` 绝对路径 | server 读取，可 env 覆盖 |
| health 轮询间隔 / 超时 | 200ms / 10s | 壳内常量 |
| SIGTERM 等待宽限 | 3s | 超过则 SIGKILL |

依赖变更：根 `package.json` 增加 `"main": "electron/main.js"`、`"scripts": { "desktop": "electron ." }`、devDependency `electron`。此变更通过 plan 审批与 `approve dependency` 记录。

## 备选方案与取舍

- **spawn + ELECTRON_RUN_AS_NODE=1（选定）**：最贴近"在壳内跑 Node 服务"的社区标准做法，ESM 原生支持，零 loader hack
- **utilityProcess.fork**：Electron 官方推荐，但 API 面不同（无 spawn 的完整 stdio 语义），且用户明确要求避免 fork 路径的 loader 兼容问题
- **spawn 系统 node**：不可取，打包分发后不保证系统有 node
- **server 内置静态托管 vs 壳内 serve 静态文件**：选前者，复用现有 server 进程与 CORS/origin 语义，避免第二套静态服务器和端口

## 失败模式、安全与回滚

| 失败模式 | 处理 |
|---|---|
| 3001 被占用 | 预检拦截，弹窗报错退出（REQ-004） |
| health 15s 超时 | kill 子进程 + 弹窗 + 退出（REQ-003） |
| server 子进程崩溃 | 'exit' 事件弹窗提示 + 退出（REQ-005） |
| better-sqlite3 原生模块 ABI 与 Electron 内嵌 Node 不匹配 | 表现为 server 启动即失败 → health 超时路径兜底；如发生，用 electron-rebuild 重编译（plan 中列为验证项） |
| 用户已在 3001 跑开发 server | 预检会拦下，弹窗提示，不会误连或误杀 |
| DB 文件位置 | 绝对路径固定，不会因 cwd 漂移写错位置 |

回滚：撤销根 package.json 的 electron 依赖/main/script、删除 `electron/` 目录、移除 server 静态托管中间件，即完全恢复纯 Web 模式；无数据迁移。

## 数据迁移

`none`。数据库仍由 server 的 better-sqlite3 管理，壳不接触 DB 文件。
