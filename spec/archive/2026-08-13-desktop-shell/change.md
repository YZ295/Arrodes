# 变更：desktop-shell（桌面壳 + 生产静态托管）

## 分类理由

本变更不是"无行为变化"的轻量改动，而是一个完整 feature：
- 新增 Electron 桌面壳（根 package.json 的 electron/main/desktop script），含后端进程生命周期管理（spawn/fork、就绪探测、退出回收、端口预检）
- server 新增生产模式静态托管 client/dist + SPA fallback（对外 HTTP 行为变化）
- 端口由 3001 迁移至 3002（配置、前端 WS 默认、文档联动）
- client 修复 36 个存量 TypeScript 类型错误（恢复可构建性）

## 范围

- 新增：`Arrodes/desktop/`（Electron 主进程，TS 编译到 dist）
- server：`src/index.ts` 生产静态托管；`config.ts` 默认端口与 repo .env 加载路径修正
- 文档：`spec/changes/desktop-shell/*` 与仓库 README

## 风险与回滚

- 端口 3002 被占用 → 壳预检拦截并报错退出（不 spawn，不误连）
- 静态托管仅 `NODE_ENV=production` 生效；development 行为不变
- 回滚：移除 `desktop/` 目录与根 package.json 的 electron 依赖，删除静态托管中间件，即可恢复纯 Web 模式

## 验证

- [x] 已确认行为、接口、依赖或跨模块变化并记录（见 verification.md）
- [x] 未引入不当 hardcode（桌面壳常量集中，路径可 env 覆盖）
- [x] 已运行适用的验证（typecheck / build / 冒烟，见 verification.md）
