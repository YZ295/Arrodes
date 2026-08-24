# 变更提案：wallpaper-plugin

## 问题与背景

用户桌面安装并运行 Wallpaper Engine（`E:\SteamLibrary\steamapps\common\
wallpaper_engine`，含 22 个 workshop 壁纸），希望阿罗德斯「连接 wallpaper，
让我的背景能够使用 wallpaper 的壁纸」——即阿罗德斯主界面背景直接使用
WE 壁纸，并能在客户端浏览、切换 WE 壁纸（同时也改变 Windows 桌面壁纸）。

社区包 `wallpaper-engine-api` 的 `getWallpaper` 走 `wallpaper64.exe -control
getWallpaper > outfile` 的 stdout 重定向，在本机实测输出为空/异常，不可依赖；
但其「列表 = 扫描 workshop 目录 project.json」「应用 = `-control
openWallpaper -file <path>`」的思路正确。经实测，`openWallpaper` 通道
（exit=0）与 `config.json`（`general.wallpaperconfig.selectedwallpapers`
记录每个显示器当前壁纸文件）均可用。据此自研薄封装，不新增第三方依赖。

## 目标

1. 服务端提供 wallpaper 能力：探测 WE 安装目录、列出壁纸、读取当前壁纸、
   应用指定壁纸、提供预览图访问，未安装/未运行时优雅降级；
2. 客户端主界面背景使用当前 WE 壁纸预览（封面裁切 + 暗色遮罩），
   断开时回退现有黑底；
3. 侧栏新增「壁纸」视图：缩略图网格、当前项高亮、点击应用、错误提示；
4. 以阿罗德斯既有插件协议（`shared/types/plugin.ts` + `PluginManager`）
   注册 `builtin.wallpaper` 客户端插件（onCommand `/wallpaper ...`），
   体现「一切皆插件」的 DSH 借鉴；
5. 给 harness 注册 `wallpaper` 技能（list/current/apply），供语音/文字控制。

## 非目标

1. 不引入 `wallpaper-engine-api` 等第三方依赖（getWallpaper 不可靠，
   且避免 wu5 dependency 审批链）；
2. 不做 WE 属性调节（properties）与 profile 管理；
3. 不做多显示器 UI 选择（服务端预留 monitor 参数，客户端 v1 全屏应用）；
4. 不改动 Windows 系统级壁纸设置本身（桌面壁纸由 WE 自己管理，
   阿罗德斯只是调用 WE 的 openWallpaper）。

## 影响范围

服务端：`server/src/services/wallpaperEngine.ts`（新）、
`server/src/services/wallpaperEngine.test.ts`（新）、
`server/src/routes/wallpaper.ts`（新）、`server/src/index.ts`（挂载路由+技能）、
`server/src/skills/wallpaper.ts`（新）、`server/src/skills/wallpaper.test.ts`（新）。

客户端：`client/src/components/WallpaperPanel.tsx`（新）、
`client/src/components/WallpaperBackground.tsx`（新）、
`client/src/core/plugins/wallpaperPlugin.ts`（新）、
`client/src/App.tsx`（背景层 + 侧栏入口）、
`client/src/components/Sidebar.tsx`（新增视图）、
`client/src/core/PluginManager.ts`（注册内置插件）。

## 风险

1. WE 未安装 / 未运行 / 目录在非默认盘：通过 env 可配 + 自动探测 +
   连接失败降级为现有黑底；
2. 预览图缺失或体积大：占位图 + 路由 Cache-Control + 客户端 cover 裁切；
3. 路径穿越（`preview/:id`）：id 必须命中服务端扫描结果白名单；
4. `config.json` 正被 WE 写入时读取可能失败：JSON 解析失败返回降级响应；
5. 应用壁纸会同时改变 Windows 桌面：UI 明确提示，属高风险操作。

## 验收标准

1. `wallpaperEngine.test.ts`：列表解析、当前壁纸解析、apply 白名单、
   穿越拒绝、未安装降级全绿；
2. `routes/wallpaper.ts` 路由测试：GET 列表/当前、POST apply、404、
   400、502 分支正确；
3. `skills/wallpaper.ts`：技能注册、execute 分支、风险分级正确；
4. 全量 server+client vitest、tsc、client build 通过；
5. 手工冒烟：客户端背景显示当前 WE 壁纸预览；面板点击切换壁纸后
   Windows 桌面与阿罗德斯背景同步变化；未运行时 UI 提示且背景正常。
