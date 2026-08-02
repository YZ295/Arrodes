# 变更提案：desktop-shell

## 问题与背景

Arrodes 目前是纯 Web 应用：`server`（Express + WS，ESM，端口 3001）与 `client`（Vite + React）分开运行，开发靠 vite proxy，生产没有任何托管路径。需要一个 Electron 桌面壳，让应用能以本地窗口形态启动：壳负责拉起 server、等服务就绪后显示窗口，退出时干净地回收 server 进程。

## 目标

一句话：给 Arrodes 加一个 Electron 壳，生产模式下由 server 直接托管 client 构建产物（`client/dist`），壳负责 spawn/停止 server、端口预检、健康就绪后才开窗，关窗即回收子进程。

## 非目标

- 不做自动更新、托盘、多窗口、打包安装器（electron-builder/forge 等）
- 不改 server 业务逻辑、路由、数据库结构
- 不改变 development 模式（vite dev + tsx watch）的现有工作流
- 不做单实例锁、开机自启、系统集成

## 影响范围

- 新增 `electron/`（主进程代码）与根 `package.json` 的 electron devDependency、`main` 字段、`desktop` script
- `server/src/index.ts` 增加静态托管中间件（production 下托管 `client/dist` + SPA fallback）
- `client` 无需代码改动（构建产物被托管，API 已是相对路径）
- 仓库根与 `spec/` 文档

## 风险

- better-sqlite3 v13 为原生模块，Electron 内置 Node 版本与系统 Node 的 ABI 可能不匹配 → 加载失败时 health 轮询超时兜底报错；必要时 `electron-rebuild`
- 端口 3001 被占用 → 壳必须启动前预检并明确报错，不能静默连错服务
- spawn 子进程的 cwd 若落在 Electron 根目录，`DB_PATH` 相对路径会写错位置 → 必须显式传绝对路径

## 验收标准

- `npm run desktop`（根目录）能拉起 server、轮询 `/api/health` 就绪后打开窗口加载 `http://localhost:3001`
- 生产模式下 `GET /` 返回 `client/dist/index.html`，非 `/api`、`/v1/chat` 的 GET 回退到 index.html，API 路径不回退
- 3001 被占用时壳报错退出；窗口全关后 server 子进程被终止，无残留
