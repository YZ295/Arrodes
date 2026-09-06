# 测试计划：desktop-shell（对齐实现版）

## 范围

覆盖 REQ-DESKTOP_SHELL-001 至 007。开发/测试用 Node 24（Windows）。

## 验证清单

### A. server 静态托管与配置（REQ-006/007）

| # | 步骤 | 预期 |
|---|---|---|
| A1 | `npm --prefix Arrodes/server run typecheck` | 通过 |
| A2 | `npm --prefix Arrodes/server run build` | dist 生成 |
| A3 | 从 server 目录 `node dist/index.js`（env 含 production/3002/DB_PATH） | 起服无报错，监听 3002 |
| A4 | `GET /api/health` | 200 |
| A5 | `GET /` | 200，返回 client/dist/index.html |
| A6 | `GET /some/deep/route` | 200，回退 index.html |
| A7 | `GET /api/v1/xxx` | 404/API 响应，不回退 |
| A8 | 从仓库根 `node Arrodes/server/dist/index.js` | 同样落 server/data，根 data/ 不重建 |

### B. Electron 壳（REQ-001/002/003/005）

| # | 步骤 | 预期 |
|---|---|---|
| B1 | `npm --prefix Arrodes run desktop` | 先构建，Electron 窗口加载 localhost:3002 |
| B2 | 主进程控制台 | 可见后端 stdout |
| B3 | 关窗 | 应用退出，无残留 node/electron 进程 |
| B4 | 手动 kill 后端进程 | 弹窗"后端已退出"并退出 |

### C. 端口占用预检（REQ-004）

| # | 步骤 | 预期 |
|---|---|---|
| C1 | 先占用 3002 再启动壳 | 报错退出，不 fork |

### D. 兼容性

| # | 步骤 | 预期 |
|---|---|---|
| D1 | better-sqlite3 在 Electron 内嵌 Node 下初始化 | 通过（health 200 即证明） |
| D2 | NSIS 安装包构建 | 通过（2026-08-12，electron-builder 26.15.3 + electron 43.4.0；未实机安装） |

## 测试证据要求

- A 组：Invoke-WebRequest/curl 状态码与内容
- B/C 组：窗口截图或日志（GUI 需人工）
- 结果写入 verification.md（2026-08-01 首轮 + 2026-08-12 复核均已记录）

## 未覆盖风险

- 未做多平台；未做打包分发；未做压力测试
