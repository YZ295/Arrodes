# 执行计划：desktop-shell（对齐实现版）

## 前置条件与基线

- 基线 spec 与变更文档就绪；server/dist 与 client/dist 已构建
- 已确认：server 为 ESM、端口 3002、`/api/health` 存在、`DB_PATH` 默认相对 cwd、WS 在 `/v1/chat`

## 依赖变更（已批准）

- 根 package.json：electron devDependency（^43.2.0）、`main: desktop/dist/main.js`、`desktop` script（先 desktop:build 再 electron .）
- desktop/package.json：electron ^43.2.0、electron-builder ^26.15.3（2026-08-12 升级，消除 tar/app-builder-lib/builder-util-runtime 审计漏洞）

## 任务拆分（已实施）

### Task-1：server 静态托管中间件（REQ-006）

- 文件：`server/src/index.ts`
- 状态：已实施并验证（production 起服 `GET /` → index.html；`/api/*` 不回退）

### Task-2：Electron 主进程 lifecycler（REQ-001/002/003/005）

- 文件：`desktop/main.ts`（fork + ELECTRON_RUN_AS_NODE + cwd + DB_PATH 绝对路径 + waitForHealth + 崩溃弹窗 + quitting 标记）
- 状态：已实施；构建通过；GUI 未实机运行（需人工验证）

### Task-3：端口探测模块（REQ-004）

- 文件：`desktop/main.ts` 内 `isPortInUse`
- 状态：已实施（占用即抛错退出，不 fork）

### Task-4：集成测试与文档收尾

- 状态：已实施——配置与数据一致性修复（env 对齐、config.ts repo env 路径、根 data/ 空壳库归档）、client 8 个存量 TS 错误修复、测试与验证证据入档（verification.md）

## 验证命令

```bash
npm --prefix Arrodes/server run build && npm --prefix Arrodes/server run typecheck
npm --prefix Arrodes/desktop run build
npm --prefix Arrodes/client run build
npm --prefix Arrodes/server run test && npm --prefix Arrodes/client run test
NODE_ENV=production PORT=3002 node Arrodes/server/dist/index.js   # 冒烟（health + GET /）
npm --prefix Arrodes run desktop                                   # 壳启动（GUI 需人工验证）
```

## 风险与回退

- 打包分发已构建验证（2026-08-12 NSIS 安装包成功产出）；未实机安装运行验证；安装包体积偏大（server node_modules 全量进包）待优化
- 回滚见 design.md「失败模式、安全与回滚」
