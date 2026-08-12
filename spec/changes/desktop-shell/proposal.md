# 变更提案：desktop-shell

## 问题与背景

Arrodes 原为纯 Web 应用：server（Express + WS，ESM）与 client（Vite + React）分开运行，开发靠 vite proxy，生产缺少托管与本地窗口形态。需要一个 Electron 桌面壳：负责拉起后端、等服务就绪后显示窗口、退出时干净回收后端进程；同时修正配置与数据目录一致性。

## 目标

一句话：给 Arrodes 加 Electron 桌面壳，生产模式下由 server 直接托管 client 构建产物（client/dist），壳负责 fork/停止后端、端口预检、`/api/health` 就绪后开窗、关窗即回收子进程；统一端口 3002 与数据目录（DB 绝对路径、server/.env 加载）。

## 非目标

- 不做自动更新、托盘、多窗口、单实例锁、开机自启（未引入 electron-updater）
- 不改 server 业务逻辑、路由、数据库结构
- 不改变 development 模式（vite dev + tsx watch）的现有工作流
- 打包分发（electron-builder 安装包）不在本变更验证范围

## 影响范围

- 新增 `desktop/`（Electron 主进程，TS 编译到 `desktop/dist/main.js`）与根 package.json 的 electron devDependency、`main` 字段、`desktop` script（构建后启动）
- `server/src/index.ts` 生产静态托管中间件（client/dist + SPA fallback）
- `server/src/config.ts`：repo .env 加载路径修正为 `server/.env`；默认端口 3002
- 端口约定 3001 → 3002（config 默认、前端 WS 默认、vite proxy、桌面壳）
- 配置与数据：`DB_PATH` 一律绝对路径（默认 `server/data`），`$HOME/.arrodes/.env` 与 `server/.env` 对齐

## 风险

- better-sqlite3 原生模块 ABI：开发运行（Electron 43 内嵌 Node）已验证；打包分发未验证
- 端口 3002 被占用：壳启动前预检，占用即报错退出，不 spawn、不误连
- 数据目录漂移：cwd 固定为 server 目录 + DB_PATH 绝对路径；历史漂移产生的根 `data/` 空壳库已备份移出

## 验收标准

- `npm run desktop`（根目录）先构建壳，再拉起后端、预检端口、轮询 `/api/health` 就绪后开窗加载 `http://localhost:3002`
- 生产模式 `GET /` 返回 `client/dist/index.html`；非 `/api`、`/v1/chat` 的 GET 回退 index.html；API 路径不回退
- 3002 被占用时壳报错退出；窗口全关后后端进程被终止，无残留；后端意外退出弹窗并退出
- 从任意目录启动后端，DB 均落 `server/data`，不再产生第二套数据目录
