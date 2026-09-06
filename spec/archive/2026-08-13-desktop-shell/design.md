# 技术设计：desktop-shell（对齐实现版）

## 当前状态（2026-08-12 复核）

- 仓库根 `E:\project\Crow5\Arrodes`，代码在 `Arrodes/` 子目录
- server：ESM（`"type":"module"`），tsc 构建到 `server/dist/index.js`；端口默认 3002；`DB_PATH` 默认 `./data`；`NODE_ENV` 默认 development；`/api/health` 存在；WS 挂载 `/v1/chat`；`cors()` 全开
- config.ts 加载顺序：`$HOME/.arrodes/.env` → `server/.env`（`../.env`；2026-08-12 修复前指向不存在的 `Arrodes/.env`，导致 server/.env 从未加载）→ `EXTRA_ENV_PATH`
- client：Vite + React，API 走相对路径 `/api/v1`，WS 默认 `localhost:3002`
- 桌面壳：`desktop/main.ts` 编译到 `desktop/dist/main.js`；根 package.json `main` 指向该产物；`desktop` script 先构建再启动
- 依赖：electron ^43.2.0（根与 desktop 一致）；electron-builder ^26.15.3（打包用，未验证）

## 方案与数据流

### 启动序列（desktop/main.ts）

```
app.whenReady()
  → 端口预检 isPortInUse(3002)：占用 → 抛错 → 错误窗口 + 退出
  → fork(server/dist/index.js, {
       cwd: serverDir,
       env: { ...process.env, PORT: '3002', NODE_ENV: 'production',
              DB_PATH: <绝对路径>, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
       stdio: ['ignore','pipe','pipe','ipc'] })
  → stdout/stderr 转发主进程
  → waitForHealth 轮询 /api/health（间隔 300ms，超时 30s）
      → 200：创建 BrowserWindow，loadURL http://localhost:3002
      → 超时：清理子进程 + 错误窗口 + 退出
```

### 退出序列

```
window-all-closed → quitting=true → kill 后端 → app.quit()
backend 'exit'（非主动，mainWindow 存在）→ dialog.showErrorBox + app.quit()
before-quit → quitting=true → kill 后端兜底（幂等）
```

### 数据一致性（关键决策）

- fork 固定 `cwd=server 目录`、`DB_PATH` 绝对路径（默认 `server/data`）：否则相对路径 `./data` 随启动目录漂移——曾造成根 `data/` 与 `server/data/` 双库分裂，历史空壳库已备份移出
- 打包到只读位置（如 Program Files）时可用 `ARRODES_DB_PATH` 把库指向用户数据目录

## 模块结构

- `desktop/main.ts`：app 生命周期、BrowserWindow、端口预检（isPortInUse）、健康轮询（waitForHealth）、退出回收（quitting 标记 + exit 弹窗）
- `server/src/index.ts`：生产静态托管（express.static + SPA fallback 正则，排除 `/api` 与 `/v1/chat`）
- `server/src/config.ts`：env 加载顺序与端口默认

## 配置、常量与依赖注入

| 项 | 默认值 | 说明 |
|---|---|---|
| PORT | 3002 | 壳 fork 固定传入；config 默认一致 |
| NODE_ENV | production（壳）/ development（config 默认） | 静态托管仅 production 生效 |
| DB_PATH | server/data 绝对路径 | 壳显式传入；ARRODES_DB_PATH 可覆盖 |
| CLIENT_DIST | server 上级 client/dist | server 读取，env 可覆盖 |
| health 轮询间隔 / 超时 | 300ms / 30s | 壳内常量 |
| 退出回收 | fork.kill（即时） | 关窗即回收 |

## 失败模式、安全与回滚

| 失败模式 | 处理 |
|---|---|
| 3002 被占用 | 预检拦截，报错退出（REQ-004） |
| health 30s 超时 | 清理子进程 + 错误窗口 + 退出（REQ-003） |
| 后端子进程崩溃 | exit 事件弹窗提示 + 退出（REQ-005） |
| better-sqlite3 ABI 不匹配 | 表现为 health 超时路径兜底（开发运行已验证 Electron 43 内嵌 Node；打包未验证） |
| 数据目录漂移 | cwd + 绝对 DB_PATH 消除；历史分裂已归档 |

回滚：移除 desktop/ 目录与根 electron 依赖、删除静态托管中间件、恢复 config.ts env 路径，即回纯 Web 模式；无数据迁移。
