# 执行计划：desktop-shell

## 前置条件与基线

- 基线 spec 与变更文档均就绪；`server/dist` 与 `client/dist` 需在验证前构建
- 已确认：server 为 ESM、端口 3001、`/api/health` 存在、`DB_PATH` 默认相对 cwd、WS 在 `/v1/chat`

## 依赖变更（需批准）

- 根 `package.json`：新增 devDependency `electron`、`"main": "electron/main.js"`、`"scripts": { "desktop": "electron ." }`

## 任务拆分

### Task-1：server 静态托管中间件

- 目标：`NODE_ENV=production` 时托管 `client/dist` + SPA fallback（REQ-006）
- 文件：`Arrodes/server/src/index.ts`（或独立 `static.ts` 中间件模块）
- 验证：
  - `RED`：当前 production 起服，`GET /` 无托管 → 404
  - `GREEN`：实现后 `GET /` 返回 index.html；`GET /api/health` 仍 200；深路径回退 index.html；`GET /api/xxx` 不回退

### Task-2：Electron 主进程 lifecycler

- 目标：spawn server（纯 Node 模式）→ health 轮询 → 开窗 → 关窗回收（REQ-001/002/003/005）
- 文件：`electron/main.js`、`electron/server-process.js`、`electron/health.js`、根 `package.json`（main/script/devDependency）
- 验证：`npm run desktop` 拉起窗口加载 localhost:3001；关窗后任务管理器确认无残留 node/electron 子进程；stdout/stderr 在主进程可见

### Task-3：端口探测模块

- 目标：spawn 前探测 3001，占用即弹窗退出（REQ-004）
- 文件：`electron/port-check.js`，接入 `main.js` 启动序列
- 验证：先手动占用 3001（如 `node -e "require('net').createServer().listen(3001)"`），再启动壳 → 弹窗报错并退出

### Task-4：集成测试与文档收尾

- 目标：全链路冒烟 + 验证证据入档
- 验证：
  - 构建 server + client → 纯 Node production 起服 → curl 验证静态托管/回退/API 行为
  - `npm run desktop` 全流程：就绪开窗、关窗回收、端口占用拦截、server 崩溃提示
  - better-sqlite3 在 Electron 内嵌 Node 下加载成功（ABI 兼容性验证项；失败则记录并评估 electron-rebuild）
  - 填写 `verification.md`

## 提交边界（原子提交，待用户授权后执行）

1. `docs(spec): desktop-shell 变更文档` — proposal/spec/design/plan/test-plan/verification + change.md
2. `feat(server): production 静态托管与 SPA fallback` — Task-1
3. `feat(electron): 壳主进程与生命周期管理` — Task-2
4. `feat(electron): 端口占用预检` — Task-3
5. `test(electron): 集成冒烟验证` — Task-4 证据

## 验证命令

```bash
npm --prefix Arrodes/server run build && npm --prefix Arrodes/server run typecheck
npm --prefix Arrodes/client run build
NODE_ENV=production PORT=3001 node Arrodes/server/dist/index.js   # 冒烟起服
npm --prefix Arrodes run desktop                                   # 壳启动
```

## 风险与回退

- Electron 二进制下载失败（网络）→ 换镜像源
- better-sqlite3 ABI 不匹配 → health 超时兜底 + electron-rebuild 评估
- 回滚方案见 design.md「失败模式、安全与回滚」
