# 阿罗德斯管家（Butler）

定时截屏 + 本地视觉模型活动总结，数据落入 Obsidian TheFool 目录。

## 运行

```cmd
start-butler.cmd                 :: 常驻运行（Ctrl+C 停止）
start-butler.cmd --once          :: 单次采集+分析，自检用
start-butler.cmd --backfill      :: 补分析历史 pending/failed/skipped 记录（需先启动 Qwen3-VL 侧车）
```

依赖：仅 `pillow`（已装在 WorkBuddy 托管 venv `C:\Users\29352\.workbuddy\binaries\python\envs\default`）。
模型：复用 Qwen3-VL 视觉侧车（`Butler\vision-sidecar`，默认 `127.0.0.1:12002`），
需单独启动（见 `vision-sidecar/README.md`）。侧车不在线时截图照常，分析记 `pending`；
侧车恢复后自动续上，历史记录用 `--backfill` 补。

## 数据结构（默认 `E:\project\HermesProject\Obsidian\TheFool`）

```
2026-09/
  20260908_14.json     <- 每小时一个 JSON，记录数组
  images/*.jpg         <- 当月截图（JPEG q60，1080p 约 150-250KB/张）
_butler/butler.log     <- 运行日志（2MB 轮转 x5）
```

记录字段：`ts`（截屏时间）、`image`（图片绝对路径）、`summary`（5 句活动总结）、`status`。

- `ok` 分析成功
- `unchanged` 屏幕无变化，复用上一张图与最近总结（不重复存图/分析）
- `pending` 侧车未启动，图已存，可 `--backfill` 补
- `analysis_failed` 超时/模型错误，可 `--backfill` 补
- `skipped` 分析积压跳帧，图已存，可 `--backfill` 补

## 参数

`--interval` 截屏间隔秒（默认 20）｜`--timeout` 分析超时秒（默认 120）｜
`--data-dir` / `--sidecar-url` / `--diff-threshold`（变化判定阈值，默认 2.0）｜`--jpeg-quality`

## 已知取舍（为简单牺牲了什么）

- 只截主显示器；多屏拼接不支持。
- 变化检测是 64x64 灰度粗对比，极端相似画面（如仅光标移动）可能漏判为"无变化"。
- Qwen3-VL 由 Ollama 管理模型生命周期；Ollama 未启动或模型未安装时分析会失败，恢复后可补处理。
- 磁盘占用：全动态使用约 1GB/天；静止时段因变化检测几乎零增量。图片不会自动清理，
  需要时手动删旧月份的 `images/` 子目录（JSON 保留）。
- 每 20 秒截全屏意味着屏幕上的敏感信息（密码、私聊）会以图片形式落盘并被本地模型读取，
  数据仅存本机，但请自行评估隐私风险。
