# 技术设计：wallpaper-plugin

## 当前状态

服务端为 ESM（`"type": "module"`），Express + WebSocket，路由集中在
`server/src/routes/*`，技能注册在 `server/src/skills/registry.ts`
（`registerSkill({ name, description, args, risk, readOnly, execute })`，
`index.ts` 启动时 import 各技能模块）。客户端 `PluginManager` 已有
插件协议（`shared/types/plugin.ts`），当前只注册 `builtin.logger`；
侧栏视图由 `Sidebar.tsx` 的 `SidebarView` 联合类型驱动，主区域背景为
`App.tsx` 的 `bg-[#050608]`。

Wallpaper Engine 事实（本机实测）：
- 安装目录 `E:\SteamLibrary\steamapps\common\wallpaper_engine`；
- workshop 目录 `E:\SteamLibrary\steamapps\workshop\content\431960`，
  每个子目录含 `project.json`（title/preview/tags/type）；
- 当前壁纸：`config.json` → `[windows用户名].general.wallpaperconfig.
  selectedwallpapers.{Monitor0,Monitor1...}.file`（媒体文件绝对路径）；
- 应用：`spawn wallpaper64.exe -control openWallpaper -file <媒体或
  project.json 路径>`（实测 exit=0，config.json 同步更新）；
- `-control getWallpaper` 的 stdout 在本机不可靠（社区包同款 bug），
  弃用，改为读 config.json。

## 方案与数据流

```
GET /api/v1/wallpaper
  → routes/wallpaper.ts → wallpaperEngine.getOverview()
      detectPaths()（env → config.json ?installdirectory → 常见路径）
      if !exe: return { connected:false, current:null, wallpapers:[] }
      wallpapers = scanWorkshop()（读每个 project.json，构造白名单）
      current = readCurrentFromConfig(config.json selectedwallpapers)
                 → 反查 id → WallpaperInfo

POST /api/v1/wallpaper/apply { id, monitor? }
  → wallpaperEngine.apply(id)
      id ∉ whitelist → throw WallpaperError(400)
      spawn(exe, ['-control','openWallpaper','-file', projectJsonPath])
      exit != 0 → WallpaperError(502)

GET /api/v1/wallpaper/preview/:id
  → whitelist 命中 → res.sendFile(previewPath, { headers: Cache-Control })
  → 未命中 → 404
```

`wallpaperEngine.ts` 导出：`getOverview()`、`listWallpapers()`、
`getCurrent()`、`apply(id, monitor?)`、`resolvePreview(id)`；
构造函数接受可注入路径（测试用 fake 目录），默认自动探测。

## 接口与兼容性

- 新增路由文件 `routes/wallpaper.ts`，`index.ts` 中
  `app.use('/api/v1/wallpaper', createWallpaperRouter())`；既有路由零改动。
- `WallpaperInfo`：
  `{ id, title, previewUrl, tags, type }`（previewUrl 相对路径
  `/api/v1/wallpaper/preview/{id}`，客户端直接可用）。
- 技能 `wallpaper`：args 无固定参数（execute 收原始文本，解析子命令），
  `risk='high'`（apply 分支）、`readOnly=false`；list/current 分支不落地。
- 客户端：`WallpaperBackground` 组件在 App 主区域最底层渲染；
  `WallpaperPanel` 作为 `SidebarView='wallpaper'`；`PanelView` 不需要改
  （由 Sidebar 直接分支渲染）。`builtin.wallpaper` 插件注册到
  `PluginManager`，onCommand 复用同一 API。

## 配置、常量与依赖注入

<!-- 说明环境差异、业务策略和领域不变量如何提供，禁止不当 hardcode。 -->

- 环境变量（禁止 hardcode）：
  - `ARRODES_WE_INSTALL`：WE 安装目录（默认自动探测）
  - `ARRODES_WE_WORKSHOP`：workshop 目录（默认自动探测）
  - `ARRODES_WE_CONTROL_TIMEOUT_MS`：spawn 超时，缺省 15000
- 依赖注入：`WallpaperEngine` 构造函数接受
  `{ installPath?, workshopPath? }`，单测注入临时目录；
  生产用 `new WallpaperEngine()`。
- 白名单：每次请求实时扫描（22 个目录，毫秒级），不缓存，
  避免 WE 卸载/新增壁纸后的陈旧状态；预览图响应加
  `Cache-Control: public, max-age=3600`。

## 备选方案与取舍

1. **引 `wallpaper-engine-api` 依赖**：getWallpaper 实测不可靠、需 dependency
   批准；否决。
2. **读 config.json 拿当前壁纸（选中）**：权威、稳定，代价是需处理
   JSON 并发写冲突（解析失败 → 降级重试一次）。
3. **后台轮询 config.json 同步背景**：v1 仅在打开面板/应用壁纸后刷新，
   不做文件监听（避免复杂度）；后续可加 fs.watch。

## 失败模式、安全与回滚

- 未安装/未运行：`connected=false`，UI 显示提示，背景保持黑底；
- 路径穿越：id 白名单校验（扫描结果为准），preview/apply 均不信任输入；
- spawn 失败/超时：返回可读错误（502），不抛裸异常；
- config.json 解析失败：返回降级 `{ connected:false }` 并记 warn；
- 预览图缺失：路由 404，客户端背景回退黑底。

## 数据迁移

`none`。如需要数据库结构或不可逆数据迁移，停止本 Skill 流程。
