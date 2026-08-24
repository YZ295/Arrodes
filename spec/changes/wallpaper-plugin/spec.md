# 行为规格：wallpaper-plugin

## ADDED Requirements

### REQ-WALLPAPER_PLUGIN-001：服务端壁纸能力总览

服务端必须提供 `GET /api/v1/wallpaper`，返回：
`{ connected: boolean, current: WallpaperInfo | null, wallpapers: WallpaperInfo[] }`，
其中 `WallpaperInfo` 至少含 `id`（workshop 目录名）、`title`、`previewUrl`。

#### Scenario：已安装且正在运行 WE

- **前置条件**：WE 可执行文件存在且 `wallpaper64.exe` 进程在运行
- **当**：客户端请求 `GET /api/v1/wallpaper`
- **则**：`connected=true`，`current` 来自 config.json 当前选中壁纸，
  `wallpapers` 为 workshop 扫描结果，每项含可访问的 `previewUrl`

#### Scenario：WE 未安装或未运行

- **前置条件**：WE 可执行文件不存在或进程未运行
- **当**：客户端请求 `GET /api/v1/wallpaper`
- **则**：`connected=false`、`current=null`、`wallpapers=[]`，
  不抛 500（客户端据此降级）

### REQ-WALLPAPER_PLUGIN-002：应用指定壁纸

服务端必须提供 `POST /api/v1/wallpaper/apply`（body：`{ id: string,
monitor?: number }`），当 `id` 命中扫描结果白名单时调用
`wallpaper64.exe -control openWallpaper -file <project.json>` 应用壁纸；
`id` 不在白名单时必须返回 400，不执行任何命令。

#### Scenario：应用合法壁纸

- **前置条件**：WE 已连接，`id` 存在于列表
- **当**：POST `/api/v1/wallpaper/apply` 携带该 `id`
- **则**：返回 200 `{ ok: true, id }`，WE 切换壁纸

#### Scenario：非法 id 或路径穿越

- **前置条件**：任意状态
- **当**：POST body 的 `id` 含 `../` 或不属于列表
- **则**：返回 400 `{ error: ... }`，不 spawn 任何进程

#### Scenario：未安装 WE

- **前置条件**：WE 不可用
- **当**：POST apply
- **则**：返回 502 `{ error: 'Wallpaper Engine 未连接' }`

### REQ-WALLPAPER_PLUGIN-003：预览图只读访问

服务端必须提供 `GET /api/v1/wallpaper/preview/:id`，仅当 `:id` 命中白名单时
返回该壁纸 `project.json.preview` 指向的本地图片文件；否则 404。

#### Scenario：合法预览

- **前置条件**：壁纸存在且 `preview` 字段指向图片
- **当**：GET `/api/v1/wallpaper/preview/:id`
- **则**：返回图片（带 Cache-Control），MIME 与扩展名一致

#### Scenario：越权路径

- **前置条件**：任意
- **当**：GET `/api/v1/wallpaper/preview/..%2F..%2Fsecret`
- **则**：返回 404，不泄露文件系统内容

### REQ-WALLPAPER_PLUGIN-004：客户端背景接入

客户端主区域必须把当前 WE 壁纸预览作为背景层（cover 裁切 + 暗色遮罩，
文本可读），壁纸加载失败或未连接时必须回退现有 `#050608` 黑底，
且不得阻塞对话功能。

#### Scenario：连接成功

- **前置条件**：服务端 `connected=true` 且有 `current`
- **当**：应用加载主区域
- **则**：背景显示 `current.previewUrl` 图片，叠加暗色遮罩

#### Scenario：未连接或加载失败

- **前置条件**：`connected=false` 或预览图加载失败
- **当**：应用加载主区域
- **则**：背景为现有黑底，控制台无未捕获异常

### REQ-WALLPAPER_PLUGIN-005：侧栏「壁纸」视图

侧栏必须新增「壁纸」入口；该视图展示壁纸缩略图网格、当前壁纸高亮、
点击项应用壁纸、失败时显示可读错误；加载中显示骨架/提示。

#### Scenario：切换壁纸

- **前置条件**：面板已加载列表
- **当**：用户点击某壁纸缩略图
- **则**：调用 apply，成功后更新当前高亮与主界面背景

### REQ-WALLPAPER_PLUGIN-006：harness wallpaper 技能

服务端必须注册 `wallpaper` 技能（list/current/apply 子命令），
`apply` 风险分级为高（改变桌面壁纸），技能不可用时返回可读错误。

### REQ-WALLPAPER_PLUGIN-007：路径可配置

WE 安装目录与 workshop 目录必须支持 env 覆盖
（`ARRODES_WE_INSTALL`、`ARRODES_WE_WORKSHOP`），未设置时自动探测
（先查 config.json `?installdirectory`，再查常见 Steam 库路径）。

### REQ-WALLPAPER_PLUGIN-008：客户端插件协议接入

客户端必须通过 `PluginManager` 注册 `builtin.wallpaper` 插件：
`onActivate` 拉取壁纸状态，`onCommand` 处理
`/wallpaper list`、`/wallpaper current`、`/wallpaper apply <id>`。

## CHANGED Requirements

无。

## REMOVED Requirements

无。
