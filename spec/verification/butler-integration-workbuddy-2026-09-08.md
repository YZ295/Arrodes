# Butler 集成验证（WorkBuddy · 2026-09-08）

目标：把用户独立开发的阿罗德斯管家后端（`Arrodes/butler/butler.py` + `Arrodes/butler-app` 控制台）接入 Arrodes 主应用：数据查看 + 截图采集控制。不另造采集引擎。

## 环境事实（勘察结论，2026-09-08 22:45）

- 工作区有用户现有修改（**不动**）：`server/src/services/visionService.ts`、`vision-sidecar/mage_vl_sidecar.py`、`spec/verification/desktop-pet-2026-09-06.md`、删除的 `TheFool/`（仓库内旧目录）、未跟踪 `Arrodes/butler/`、`Arrodes/butler-app/`。
- 用户当前正在运行：Arrodes Electron 主应用（dev electron.exe x4，占用端口 3002）+ Mage-VL 视觉侧车（python PID 33328，127.0.0.1:12002）。**验证服务器一律用备用端口，绝不 kill 上述进程。**
- 真实数据目录 `E:\project\HermesProject\Obsidian\TheFool`：月份 `2026-09/`，8 个小时 JSON，summaries 1 天；`_butler/state.json` 更新于 21:48（约 1 小时前，`summarizing:true` 但无活进程 → 陈旧状态样本）。当前无 butler 引擎进程在运行。
- Python 解释器：`C:\Users\29352\.workbuddy\binaries\python\envs\default\Scripts\python.exe`（存在，与 butler-app 一致）。

## 集成方案（最小可靠）

模块边界：引擎逻辑全部留在 `butler.py`；主应用只做"薄桥接"。

### 1. butler.py 针对性小改（保留现有全部功能/参数）

- 常驻启动时写 `_butler/engine.json`：`{"pid", "started_at", "data_dir"}`；退出时（finally）仅当 pid 仍是自己才删除。
- 主循环每秒检查 `_butler/stop.flag`：存在 → 记日志、删 flag、置 running=False 优雅退出（跨实例停止信号，任何 UI 都能停）。
- 启动时清除残留 stop.flag。
- `--once` / `--backfill` 模式不写 engine.json（不是常驻引擎）。

### 2. 主应用服务端：`server/src/services/butlerService.ts` + `routes/butler.ts`

- 状态：读 `engine.json` + `process.kill(pid,0)` 活性检查；结合 `state.json` 的 `updated_at` 判 stale（>120s）。无 engine.json 但 state.json 新鲜 → 判定"外部旧版实例"（只读状态，不可控停）。
- 启动：先协调（活引擎存在 → 返回 alreadyRunning，不重复 spawn）；解释器/脚本不存在 → 明确失败；spawn 后轮询 engine.json 出现本 child 的 pid 才算成功，进程退出/超时 → 失败并带 stderr 尾部（启动失败不得误报成功）。
- 停止：写 `stop.flag` → 等待 pid 消失（≤10s）→ 仍活则 managed child kill / 外部实例 taskkill 兜底 → 校验真死。
- 数据读取（只读）：最近记录（当月最后 3 个小时文件）、汇总日期列表、按日 10 分钟段汇总。全部路径校验（ymd 8 位数字），损坏 JSON 跳过。
- 配置可覆盖：`BUTLER_DATA_DIR` / `BUTLER_PYTHON` / `BUTLER_SCRIPT` / `BUTLER_SIDECAR_URL` / `BUTLER_INTERVAL`，默认兼容本机现状（数据目录指向 TheFool、python 指向 workbuddy venv、侧车 12002）。不暴露任何凭证。
- 路由挂 `/api/v1/butler/*`，天然在现有 `localAccess` 中间件之后（本地鉴权边界）。
- 不接问答模型/桌宠动画/摄像头/训练/清理。

### 3. 主应用前端：`client/src/components/ButlerPanel.tsx` + Sidebar "管家" 入口

- 黑蓝 UI 既有样式体系（Tailwind 变量 + 白/蓝/青配色，与 ActivityPanel/SkillsPanel 一致）。
- 状态区：运行（绿）/ 停止 / 异常（陈旧 state、外部旧版实例）+ 汇总中/队列；采集启停按钮 + 错误提示；最近记录；按日 10 分钟汇总（日期选择）。
- 按钮错误处理：失败显示后端 reason，不静默。

### 4. butler-app 独立控制台兼容（保留全部功能）

- `startEngine`/`stop`/`status` 增加 engine.json 协调（与主应用同一约定）：外部已运行 → 拒绝启动并提示；停止外部实例走 stop.flag；其余（问答、人工修正、侧车管理）不动。
- 抽出纯 Node 模块 `butler-app/engineCoord.cjs` 供 main.cjs 使用，可直接 node 脚本验证兼容性。

## 进度记录

- [x] 勘察仓库/接口/真实数据/进程现状
- [x] 方案定稿（本文档）
- [x] RED：行为测试先写先失败（`butlerService.test.ts` / `routes/butler.test.ts` / `ButlerPanel.test.tsx` 均因模块缺失 FAIL）
- [x] GREEN：实现完成，25 个服务端测试 + 5 个前端测试全部通过
- [ ] Vitest 全量 + 构建 + typecheck（进行中）
- [ ] 真实验收（真实 HTTP 读 TheFool 汇总 + 隔离目录真实采集 E2E + 控制台兼容）
- [ ] 证据与风险总结

## 已实现改动

| 文件 | 改动 |
|---|---|
| `Arrodes/butler/butler.py` | 常驻启动写 `_butler/engine.json`（pid 标识，退出自删）；主循环每秒检查 `_butler/stop.flag` 优雅退出；启动清残留 flag。其余逻辑不动（--once/--backfill 不写标识） |
| `Arrodes/server/src/services/butlerService.ts`（新） | 引擎协调 + 只读数据访问；env 可覆盖（BUTLER_DATA_DIR/BUTLER_PYTHON/BUTLER_SCRIPT/BUTLER_SIDECAR_URL/BUTLER_INTERVAL），默认兼容本机 |
| `Arrodes/server/src/routes/butler.ts`（新） | GET status/records/summary/dates/day + POST start/stop；挂 `/api/v1/butler`（localAccess 之后） |
| `Arrodes/server/src/index.ts` | 注册 butler 路由（2 行） |
| `Arrodes/client/src/components/ButlerPanel.tsx`（新） | 状态徽章（运行/停止/异常/外部旧版）+ 启停按钮（错误显示后端 reason）+ 最近记录 + 按日 10 分钟段汇总 |
| `Arrodes/client/src/components/Sidebar.tsx` / `PanelView.tsx` | "管家"导航入口 + 面板挂载（黑蓝既有样式体系） |
| `Arrodes/butler-app/engineCoord.cjs`（新） | 跨实例协调纯模块（与主应用同一约定） |
| `Arrodes/butler-app/main.cjs` | start/stop/status 接入协调（外部活引擎拒绝启动；stop.flag 优雅停任意实例；taskkill 兜底）。问答/人工修正/侧车管理不动 |
| `Arrodes/butler-app/engine-coord.test.cjs`（新） | 控制台兼容性验证脚本（node 直跑，5/5 通过） |

## 测试结果（已完成部分）

- RED 确认：三份新测试文件先写，运行均失败（模块不存在）。
- GREEN：`server` `npx vitest run src/services/butlerService.test.ts src/routes/butler.test.ts` → **25 passed**（含真实子进程 start→有新记录→stop→不新增→start→又有记录）。
- `client` `npx vitest run src/components/ButlerPanel.test.tsx` → **5 passed**。
- `butler-app` `node engine-coord.test.cjs` → **5/5 通过**（外部实例拒绝启动、stop.flag 跨实例停止、陈旧 state 不误判）。
- `python -m py_compile butler.py` → OK。

