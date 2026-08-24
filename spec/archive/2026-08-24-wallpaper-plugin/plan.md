# 实施计划：wallpaper-plugin

> 本文件批准后保持不可变；任务进度写入 `spec/state.json`。

## 任务

1. 测试先行：`wallpaperEngine.test.ts` 写失败单测（fake 目录/config 注入），
   覆盖 REQ-001~003/007（列表、当前、白名单、穿越拒绝、未安装降级、
   env 探测）；运行确认 RED。
2. 实现 `services/wallpaperEngine.ts`（探测/列表/当前/应用/预览），单测转绿。
3. `routes/wallpaper.ts` + `index.ts` 挂载 + 路由测试（REQ-001~003），RED→GREEN。
4. `skills/wallpaper.ts` 注册 + 测试（REQ-006），RED→GREEN。
5. 客户端：`WallpaperBackground` 接入 App.tsx（REQ-004），
   `WallpaperPanel` + Sidebar 入口（REQ-005），
   `builtin.wallpaper` 插件（REQ-008）。
6. 重构 + 全量验证：server vitest、client vitest、tsc、client build。
7. 双层审查（规格符合性 + 代码质量 + hardcode 检查），更新当前规格并归档。

## 原子提交边界

<!-- 每个任务说明对应提交。 -->

1. `test(server): wallpaperEngine 失败测试（RED）`
2. `feat(server): wallpaperEngine 实现（GREEN）`
3. `feat(server): /api/v1/wallpaper 路由（list/current/apply/preview）`
4. `feat(server): wallpaper 技能注册（REQ-006）`
5. `feat(client): 壁纸背景 + 面板 + 插件（REQ-004/005/008）`
6. `test(server): 全量验证 + 验证证据登记`
7. `docs(spec): 归档 wallpaper-plugin`
