# Mage-VL 实施与验证

日期：2026-09-04～05，最新 Node 验证时间 09-05 01:42（Asia/Shanghai）。本记录不改变旧 Wu5 活动变更或其他 UI 工作。

## 最新结果（09-05）

- 实际 CUDA 4bit 单图推理、Node `/api/v1/vision/status` 与图片转发均已通过，不再受下载阻塞。
- server 295 项、client 34 项、Python 侧车 10 项测试通过；server/client 构建通过。当前共新增 28 项聚焦测试。
- 使用用户提供的 `E:/AI/magevl-env` 和 `E:/AI/HF`，没有替换驱动、重新下载模型或修改真实 `.env`。
- Windows `mmap` 原生访问冲突已用临时 `pread` + 串行权重加载修复；补丁在成功/异常后均恢复原函数与环境变量，非 Windows 不变。没有保留为测试绕过依赖的生产分支。
- 本地 Python 包目录在 E 盘，但 venv 的基础解释器仍依赖 `D:/Anaconda/envs/cosyvoice`，并非完全独立的 E 盘 Python。

## 交付范围

- 固定 Python 直接依赖，提供 Windows 启动器、独立环境安装、CUDA/CPU、离线缓存与故障指引；Windows 单图依赖不包含 Linux-only 视频 codec 包。
- 扩展 `server/.env.example`，区分 Node 的视觉提供商设置与单独启动的 Python 进程变量。
- Mage-VL 健康检查带 5 秒超时、响应验证、模型/设备/冷启动状态和 Windows 恢复步骤。
- Vision 面板启动时检查状态，8 秒超时，可手动重试，卸载时取消请求；离线禁用分析且保留图片，分析失败后重新检查状态。PNG 等上传格式不再被写死为 JPEG。
- 修复侧车模型类、聊天模板、输入设备/精度、仅解码生成 token、加载失败缓存和无效图片先校验。同步推理在 FastAPI 工作线程运行，避免阻塞健康端点。
- 使用既有 Vitest / unittest；新增 jsdom 30.0.1 仅用于真实 React DOM 交互测试。未修改其他任务的 App、Sidebar、StatusBar 或全局样式。

## RED 证据

- `npm --prefix Arrodes/server test -- src/services/mageVisionStatus.test.ts`：退出 1，7 个新用例失败；缺失 provider/state/device、接受异常健康状态、缺少 Windows 指引。
- `npm --prefix Arrodes/client test -- src/modules/vision/VisionPanel.test.tsx`：退出 1，最初 6 个用例失败；面板未检查或呈现视觉服务状态。
- `python -m unittest discover -s Arrodes/vision-sidecar -p test_mage_vl_sidecar.py`：退出 1，初始 4 项中 3 项失败；缓存残留、未调用聊天模板、无效图片错误触发加载。

## GREEN 与回归

| 验证 | 结果 |
| --- | --- |
| `npm --prefix Arrodes/server test` | 退出 0；55 文件，295 项通过 |
| `npm --prefix Arrodes/server run build` | 退出 0；TypeScript 构建通过 |
| `npm --prefix Arrodes/client test` | 退出 0；8 文件，34 项通过 |
| `npm --prefix Arrodes/client run build` | 退出 0；TypeScript 与 Vite 生产构建通过 |
| `uv run --isolated --python 3.12 --with fastapi==0.141.1 --with pydantic==2.13.5 --with pillow==12.3.0 --with httpx==0.28.1 python -m unittest discover -s Arrodes/vision-sidecar -p test_mage_vl_sidecar.py` | 退出 0；6 项通过，无权重/GPU/网络推理 |
| `uv pip compile Arrodes/vision-sidecar/requirements.txt --python-version 3.12 --python-platform windows --only-binary=:all: --no-header --no-annotate` | 退出 0；47 个包解析成功，无需本地编译；未完整安装 torch 栈 |
| 对 VisionPanel、useVisionStatus 及其测试运行 oxlint | 退出 0 |
| PowerShell Parser 检查启动器 | 无语法错误 |
| 启动器使用不存在的 `-PythonPath` | 预期退出 1；给出创建环境、安装 requirements 和覆盖解释器路径的指引 |
| `git diff --check` | 退出 0 |

本次新增 24 项测试：服务健康 7、真实 HTTP 路由链路 3、客户端交互 8、Python 侧车 6。

## 冒烟验证

- 从仓库根目录调用应用子目录的 `start-magevl.ps1`，指定已有解释器和端口 12009，成功启动仅监听 loopback 的 Uvicorn。
- `GET /health` 返回 200、`ready`、`microsoft/Mage-VL`、`not-loaded`；无效图片返回 400。测试后 Ctrl+C 正常停止，12009 无残留监听。
- 浏览器使用实际 VisionPanel、既有 CSS 和模拟 API，验证离线 → 上传 PNG → 重新检查 → 分析成功；页面错误 0。
- 一次桌面/窄屏检查：1440×900、390×844；无横向溢出，恢复指引可读。截图位于本地忽略目录 `.impeccable/review/vision-desktop.png` 和 `vision-mobile.png`。临时预览 HTML/脚本已删除，不进入产品。

## 限制与已有警告

- 实际模型验证使用单图、CUDA 4bit；CPU/8bit/非量化完整推理未实测。单元测试使用替身；另已完成真实侧车和独立 Node 路由链路验证，未把桌面 UI 的模拟 API 浏览器验证说成真实桌面模型验收。
- 客户端构建仍有 >500 kB chunk 警告；不影响构建成功。
- 客户端 npm audit 仍报告原有 nanoid 3.3.16（high）和 postcss 8.5.22（moderate）；已对照 HEAD 锁文件确认版本原先存在，未扩大范围自动升级。
- 测试环境 Starlette 对 httpx TestClient 发出弃用警告，测试通过。
- 未修改真实 `.env`，未提交、push、创建 PR 或合并；现有及并发 UI 修改保留。

## 20:52–21:14 实机环境续验

- 检测到 RTX 4060 Laptop GPU（8188 MiB）、NVIDIA 572.83 驱动；创建 `Arrodes/vision-sidecar/.venv`（Python 3.12.0），下载缓存和模型目录均位于项目 E 盘、已被忽略。
- 原 `torch==2.14.0` / `torchvision==0.29.0` 无 CUDA 12.8 匹配包：官方 cu128 索引 dry-run 解析失败。改固定为官方配对 `torch==2.11.0` / `torchvision==0.26.0`，GPU 命令显式安装 `+cu128`；没有升级系统驱动。
- 新 requirements 的 Windows / Python 3.12 / only-binary 解析成功，共 47 个依赖。官方版本配对依据：https://pytorch.org/get-started/previous-versions/ 。这仅验证可解析，不代表完整安装或 GPU 运算通过。
- 20:57 重新运行 server 全部 295 项测试及 tsc、client 全部 34 项测试及 TypeScript/Vite 构建，均退出 0。21:13 独立 Python 3.12 侧车测试 6 项通过。`git diff --check` 退出 0。
- 尝试下载固定模型 revision `d88b153285f1633a61b2f693c59c8576693af185`。仅部分配置/自定义代码下载完成，两片主权重未完成；本地 `models/Mage-VL` **不能当作可运行模型**。
- 下载先尝试直连，再仅给子进程设置 Windows 已有的本地代理，未改系统代理设置。官方 PyTorch 索引所指向的 `download-r2.pytorch.org` 在 4 次重试后连接超时；官方直接 wheel 地址也停滞。HF 分别尝试 Xet 与普通 HTTP，权重未取得有效进展。
- 21:14 停止本次两个下载进程，确认无对应 uv/Python 子进程残留。保留已下载缓存与未完成环境，未删除用户文件、未启动生产服务。恢复网络后按 README 重新安装和下载；完整 GPU 环境、真实图片推理及真实 Node→模型链路仍待验证。

## 09-04 深夜～09-05 最终实机验证

- 用户提供完整的模型缓存，快照 revision 保持 `d88b153285f1633a61b2f693c59c8576693af185`。两片主权重实际 blob 大小为 4,967,403,560 / 4,516,272,328 字节；快照文件是 Windows 符号链接，不能按链接本身的 0 字节长度判断损坏。未重复做全文件哈希；完整性校验由用户报告。
- 环境：Python 3.10.20、torch 2.5.1+cu121、transformers 5.16.1、bitsandbytes 0.50.2、safetensors 0.8.0。补装 torchvision 0.20.1（CPU 预处理即可）并将 sympy 1.14.0 调整到 torch 要求的 1.13.1，`pip check` 返回 `No broken requirements found`。
- 新依赖清单与安装命令同步到已验证版本，包含 opencv-python-headless 5.0.0.93；Windows/Python 3.10/only-binary 解析成功，共 48 个依赖。
- 原 4bit、非量化、限制数学线程和关闭异步加载均在权重 0/696 时崩溃；Windows 事件 1000/1001 为 `torch_cpu.dll` / `0xc0000005`。faulthandler 定位到 `torch.storage.__getitem__`、Transformers `_materialize_copy` 的 safetensors mmap 路径。`disable_mmap=True` 全量读分片又触发 MemoryError，未作为修复保留。
- 临时改用 `pread` 后 696/696 权重成功加载，约 13.4 秒；真实 `/analyze` 将蓝色方块识别为 `Blue.`，推理 1019 ms。补齐 torchvision 后重新启动复验仍成功：加载 14.3 秒、推理 937 ms。
- 使用生产构建的 `createVisionRouter` 在独立 loopback Express 进程验证：`GET /api/v1/vision/status` 返回 `available=true, provider=magevl, state=ok, device=cuda`；`POST /api/v1/vision/analyze-base64` 将确定性噪声图识别为彩色抽象/电视雪花图案，非空描述，6416 ms。没有修改生产鉴权或实际应用配置。
- `pread` 与串行加载用例先失败（原函数未替换/环境开关未设置），实现后通过；增加异常恢复、非 Windows 不改行为用例。安装桩测试先因缺少可分发包失败，补齐后通过。最终 Python 测试 10 项通过。
- 图像专用桩作为本地包 `arrodes-magevl-image-only-mamba==0.1.0` 纳入仓库，构建和隔离安装通过；`create_block` 明确抛出 NotImplementedError。未覆盖用户已有手工桩，不提供视频功能。
- 09-05 01:41 server 默认测试碰到本机 SQLite `disk I/O error`（既有 ws/handler 测试导入真实配置）；设置 `DB_PATH` 到项目忽略目录 `.cache/server-validation` 后，01:42 全部 295 项测试及 tsc 通过。client 全部 34 项测试与 TypeScript/Vite 构建通过。未修改实际数据库。
- 测试侧车/Node 进程已停止，12009/12010 无残留监听；没有提交、push、PR 或 merge。
