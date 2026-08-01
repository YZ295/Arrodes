# 测试计划：desktop-shell

## 范围

覆盖 REQ-DESKTOP_SHELL-001 至 006。开发/测试用 Node v24.18.0（Windows）。

## 验证清单

### A. server 静态托管（REQ-006，Task-1）

| # | 步骤 | 预期 |
|---|---|---|
| A1 | `npm --prefix Arrodes/server run typecheck` | 通过，无类型错误 |
| A2 | `npm --prefix Arrodes/server run build` | dist 生成 |
| A3 | `NODE_ENV=production PORT=3001 node Arrodes/server/dist/index.js` | 起服无报错 |
| A4 | `curl http://localhost:3001/api/health` | 200 |
| A5 | `curl http://localhost:3001/` | 200，返回 `client/dist/index.html` 内容 |
| A6 | `curl http://localhost:3001/some/deep/route` | 200，回退 index.html |
| A7 | `curl http://localhost:3001/api/v1/xxx` | 404 或现有 API 响应，**不回退** index.html |
| A8 | development 模式（无 NODE_ENV=production） | 不托管静态文件，行为不变 |

### B. Electron 壳启动（REQ-001/002/003，Task-2）

| # | 步骤 | 预期 |
|---|---|---|
| B1 | `npm --prefix Arrodes run desktop` | Electron 窗口打开，加载 `http://localhost:3001` |
| B2 | 主进程控制台 | 可见 server 子进程 stdout 日志 |
| B3 | 窗口内交互（发消息等） | 功能可用，WS 走 3001 |
| B4 | 关闭窗口 | 应用退出，server 子进程被回收（任务管理器无残留 node 进程） |

### C. 端口占用预检（REQ-004，Task-3）

| # | 步骤 | 预期 |
|---|---|---|
| C1 | 先 `node -e "require('net').createServer().listen(3001)"` 占用端口 | 监听成功 |
| C2 | 启动壳 | 弹窗提示端口占用，应用退出，不 spawn server |

### D. 异常路径（REQ-003/005，Task-2）

| # | 步骤 | 预期 |
|---|---|---|
| D1 | 模拟 server 启动失败（如临时改名 dist/index.js） | health 超时，弹窗报错，退出，无残留进程 |
| D2 | 窗口打开后手动杀掉 server 进程 | 壳检测到子进程退出，弹窗提示并退出 |

### E. 兼容性（Task-4 验证项）

| # | 步骤 | 预期 |
|---|---|---|
| E1 | 壳内 spawn 的 server 正常完成数据库初始化 | better-sqlite3 在 Electron 内嵌 Node 下 ABI 兼容 |
| E2 | E1 失败时 | 记录错误信息，评估 electron-rebuild 方案 |

## 测试证据要求

- A 组：curl 输出与状态码
- B 组：窗口截图 + 主进程日志
- C/D 组：弹窗截图或日志
- 结果写入 `verification.md`

## 未覆盖风险

- 未做多平台（仅 Windows 实测）
- 未做打包分发验证（electron-builder 等不在本次范围）
- 未做高负载/并发压力测试
