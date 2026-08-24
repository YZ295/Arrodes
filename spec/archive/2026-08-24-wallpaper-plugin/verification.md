# 验证记录：wallpaper-plugin

## TDD 证据

### RED（2026-08-24）

- `wallpaperEngine.test.ts` 首跑：`Cannot find module './wallpaperEngine.js'`，
  模块不存在，测试套件失败（1 failed，0 tests）。
- 首版实现后 15 用例：14 通过 / 1 失败——「未安装时抛 502」：
  `apply` 先查白名单（返回 400）后查连接；按 REQ-002 规格调整为
  先连接（502）后白名单（400），转绿。
- `wallpaperEngine.ts` 手写 `??` 与 `||` 混用未加括号 → oxc 语法错误；
  补括号后通过。

### GREEN

- `wallpaperEngine.test.ts`：16 通过（列表/当前/正反斜杠归一化/白名单/
  穿越拒绝/未安装降级/env 覆盖/apply 控制调用/预览 MIME）。
- `wallpaper.test.ts`（路由）：13 通过（GET 总览、POST apply 200/400、
  预览 200/404/越权 404）。
- `skills/wallpaper.test.ts`：6 通过（注册/风险分级/list/current/apply/
  降级）。

### 真实冒烟（本机 WE）

- `GET /api/v1/wallpaper`：connected=true，20 个可用壁纸，
  current=3272717573「山晚-三叶-三葉漫剪」（读 config.json 正确）；
- `GET /api/v1/wallpaper/preview/3272717573`：200 image/jpeg、
  Cache-Control=public, max-age=3600、558899 字节；
- `POST /api/v1/wallpaper/apply`（当前壁纸 id）：200 { ok:true }，
  WE config.json 的 Monitor0 保持不变（桌面壁纸未被误改）；
- 未知 id 404、`..%2F..%2Fsecret` 越权 404；
- 客户端 `npm run build` 成功（237 模块），壁纸背景/面板/插件已接入。

## 自动验证

<!-- `verify` 命令在此追加摘要。 -->

## 审查

- [x] 规格符合性审查——REQ-001~008 全部落地：
  GET 总览/apply/preview 白名单与状态码、背景降级、侧栏视图、
  harness 技能、env 探测、客户端插件协议；
- [x] 代码质量审查——测试先行 35 用例全绿（服务端 16+13+6）、
  全量 479 通过、client tsc/build 通过；无 shell 字符串拼接、
  路径白名单防穿越、config 解析失败降级；
- [x] 未引入不当 hardcode——仅保留 Steam 官方默认安装位
  （`Program Files (x86)/Program Files`，与社区包同款缺省）与
  WE workshop 平台常量 `431960`；用户实际路径 `E:\SteamLibrary`
  未写死（走盘符扫描），env 可覆盖；
- [x] 独立复审（不适用时写明原因）——单人会话内实施，已按
  RED→GREEN 证据、真实 WE 冒烟与全量门禁复核；未另开独立复审人。

## 偏差、风险与遗留债务

- 设计文档称「WallpaperPanel 由 Sidebar 直接分支渲染」；实现走既有
  `PanelView` 面板路由（与 workspace/memory 等一致），改动更小；
- `connected` 以实现层面的「安装目录存在且 exe 在位」为代理，
  未做进程级探测（进程探测每次请求多 100-300ms，v1 不划算）；
- 预览缺失的壁纸客户端显示占位图标，路由返回 404；
- 多显示器：服务端预留 monitor 参数，客户端 v1 全屏应用。

### 自动验证 2026-08-24T20:23:05+08:00

- 范围：`targeted`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过

### 自动验证 2026-08-24T20:23:51+08:00

- 范围：`targeted`
- `vitest-server`：exit `0`，通过
- `vitest-client`：exit `0`，通过
- `tsc-server`：exit `0`，通过
- `build-client`：exit `0`，通过
