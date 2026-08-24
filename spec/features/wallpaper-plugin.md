# 壁纸插件：连接 Wallpaper Engine（wallpaper-plugin）

## 概述

阿罗德斯主界面背景直接使用 Wallpaper Engine 壁纸；客户端可浏览、切换
WE 壁纸（同时改变 Windows 桌面壁纸），并可经语音/文字控制。不引入
第三方依赖：列表扫 workshop 目录、当前壁纸读 WE `config.json`、
应用走 `wallpaper64.exe -control openWallpaper`（spawn 无 shell）。

## 服务端

- `WallpaperEngine`（`server/src/services/wallpaperEngine.ts`）：
  - 路径探测：显式注入 > `ARRODES_WE_INSTALL` / `ARRODES_WE_WORKSHOP`
    > 常见 Steam 安装位置 > 盘符扫描（`SteamLibrary` / `Steam` 布局）；
  - `listWallpapers()`：扫描 workshop 子目录 `project.json`
    （title/preview/tags/type），构成 id 白名单；
  - `getCurrent()`：读安装目录 `config.json`
    `[用户名].general.wallpaperconfig.selectedwallpapers.Monitor0.file`，
    路径正/反斜杠归一化后与白名单匹配；
  - `apply(id, monitor?)`：先判连接（502）→ 再判白名单（400）→
    spawn `-control openWallpaper -file <project.json>`，
    超时 `ARRODES_WE_CONTROL_TIMEOUT_MS`（缺省 15s）；
  - `resolvePreview(id)`：仅白名单内返回预览路径 + MIME。
- 路由 `GET/POST /api/v1/wallpaper`、`POST /apply`、
  `GET /preview/:id`（Cache-Control: max-age=3600；越权/未知 404）。
- 技能 `wallpaper`（`server/src/skills/wallpaper.ts`）：
  `list` / `current` / `apply <id>`，`risk='high'` 走 actionGate 授权。

## 客户端

- `WallpaperBackground`：主区域背景 = 当前壁纸预览（cover + 暗色遮罩），
  未连接/加载失败回退黑底，不阻塞对话；监听
  `arrodes:wallpaper-changed` 事件刷新。
- `WallpaperPanel`：侧栏「壁纸」视图——缩略图网格、当前高亮、点击应用、
  错误提示、未连接引导（配置 env）。
- `builtin.wallpaper` 插件（`client/src/core/plugins/wallpaperPlugin.ts`）
  注册进 PluginManager；`onCommand` 处理
  `/wallpaper list | current | apply <id>`（聊天输入 `/` 前缀命中）。

## 边界与安全

- apply/preview 一律以实时扫描白名单为准，id 不直接拼路径（防穿越）；
- 未安装/未运行：`connected=false`，UI 与技能均降级提示，不抛 500；
- 多显示器：服务端预留 monitor 参数，客户端 v1 全屏应用；
- `connected` = exe 在位（进程级探测每请求多 100-300ms，v1 不做）。
