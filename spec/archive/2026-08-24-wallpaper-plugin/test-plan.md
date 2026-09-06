# 测试计划：wallpaper-plugin

## 需求—测试映射

| 需求 ID | 测试文件/用例 | 层级 | 预期 RED | 验收结果 |
|---|---|---|---|---|
| REQ-WALLPAPER_PLUGIN-001 | `wallpaperEngine.test.ts`：列表/当前/connected 降级 | unit | 模块不存在报错 | 通过 |
| REQ-WALLPAPER_PLUGIN-002 | `wallpaperEngine.test.ts`：apply 白名单/非法 id/未安装 502 | unit | 同上 | 通过 |
| REQ-WALLPAPER_PLUGIN-003 | `wallpaperEngine.test.ts`：resolvePreview 合法/越权 404 | unit | 同上 | 通过 |
| REQ-WALLPAPER_PLUGIN-007 | `wallpaperEngine.test.ts`：env 覆盖与自动探测优先级 | unit | 同上 | 通过 |
| REQ-WALLPAPER_PLUGIN-001~003 | `routes/wallpaper.test.ts`：GET/POST/404/400/502 | integration | 路由未挂载断言失败 | 通过 |
| REQ-WALLPAPER_PLUGIN-006 | `skills/wallpaper.test.ts`：注册/子命令/风险分级 | unit | 注册前列表缺项 | 通过 |
| REQ-WALLPAPER_PLUGIN-004/005/008 | 手工冒烟：背景显示/面板切换/插件命令 | smoke | 实施前无 UI | 通过 |

## 验证命令

- `npx vitest run src/services/wallpaperEngine.test.ts src/routes/wallpaper.test.ts src/skills/wallpaper.test.ts`（目标）
- `npm --prefix Arrodes/server test`（全量）
- `npm --prefix Arrodes/client test`（vitest）
- `npm --prefix Arrodes/server run typecheck`（tsc --noEmit）
- `npm --prefix Arrodes/client run build`（tsc -b + vite build）
- 手工冒烟：启动服务端 → `GET /api/v1/wallpaper` 返回 22 项与当前壁纸；
  POST apply 切换后 `config.json` 与 Windows 桌面同步变化；
  客户端背景跟随；停掉 WE 后 UI 降级不报错。
