# Mage-VL 本地视觉侧车

Arrodes 的可选单图识别服务：Vision 面板 → Node `/api/v1/vision/*` → 本机 Python 侧车 → Mage-VL。默认只监听 `127.0.0.1:12002`，没有远程鉴权，不要向局域网或公网暴露。侧车需单独启动，不会由 Electron 自动启动，也不随安装包分发。

## Windows 安装

使用独立的 **64 位 Python 3.10 或 3.12** 环境，不要直接向 CosyVoice 环境安装依赖。真实 RTX 4060 推理使用 Python 3.10.20；无权重测试也在 3.12 通过。下面从仓库内的 `Arrodes` 应用目录（含 `server`、`client`、`vision-sidecar`）执行：

```powershell
py -3.10 -m venv .\vision-sidecar\.venv
```

`requirements.txt` 固定直接依赖版本，不是包含所有传递依赖和模型权重的锁文件。单图路径不需要上游视频专用的 `codec-video-prep`、Flash Attention、Mamba 或 decord；特别是 codec 包没有 Windows wheel，不能直接照搬视频环境。

如使用 NVIDIA GPU，请先根据 [PyTorch 官方版本说明](https://pytorch.org/get-started/previous-versions/) 安装与驱动匹配的 CUDA wheel，保持 `torch==2.5.1` / `torchvision==0.20.1` 版本配对，再安装本文件。RTX 4060 / 572.83 已用 CUDA 12.1 实测通过，不需要升级驱动：

```powershell
.\vision-sidecar\.venv\Scripts\python.exe -m pip install torch==2.5.1+cu121 --index-url https://download.pytorch.org/whl/cu121
.\vision-sidecar\.venv\Scripts\python.exe -m pip install -r .\vision-sidecar\requirements.txt
.\vision-sidecar\.venv\Scripts\python.exe -m pip check
```

不使用 NVIDIA GPU 时，跳过 CUDA wheel 命令，直接安装 `requirements.txt` 并运行 `pip check`。

`torchvision` 用于 CPU 图像预处理，实测 PyPI 的 0.20.1 CPU wheel 即可；不要求其 CUDA 扩展。不要同时安装 `opencv-python` 与 `opencv-python-headless`。

新建的**单图专用**环境还需安装仓库提供的可选导入桩，以满足 Mage-VL 对视频模块的静态依赖检查：

```powershell
.\vision-sidecar\.venv\Scripts\python.exe -m pip install .\vision-sidecar\image-only-mamba
```

该包不是 Mamba 的实现，触发视频门控会明确报错；已有真实 `mamba-ssm` 或手工桩的环境不要重复安装/覆盖。以后做视频时，先卸载 `arrodes-magevl-image-only-mamba`（手工桩需按原安装方式移除），再安装真实视频依赖。不要直接在 CosyVoice 等共享环境安装这个同名模块。

用以下命令确认，不能仅凭安装了 CUDA Toolkit 判断：

```powershell
.\vision-sidecar\.venv\Scripts\python.exe -c "import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())"
```

CUDA 默认 4bit；也支持 `8bit`、`none`。CPU 会自动禁用量化并使用 float32，内存占用更大、速度更慢。实际显存还取决于图片大小、输出长度及其他进程，不保证某一显卡必定够用。

## 配置与启动

在 **`server/.env`** 设置以下变量，然后重启 Node 后端或桌面应用：

```dotenv
VISION_PROVIDER=magevl
MAGEVL_SIDECAR_URL=http://127.0.0.1:12002
```

`VISION_MODEL` 仅影响 DeepSeek/Ollama，不选择 Mage-VL 权重。Python 侧车**不会读取 `server/.env`**，请在启动侧车的 PowerShell 中设置：

```powershell
$env:MAGEVL_MODEL = 'microsoft/Mage-VL'  # 也可为完整的本地模型目录
$env:MAGEVL_QUANT = '4bit'             # 4bit | 8bit | none
powershell -NoProfile -File .\vision-sidecar\start-magevl.ps1
```

如果本机策略不允许运行脚本，无需修改全局执行策略，可直接启动：

```powershell
.\vision-sidecar\.venv\Scripts\python.exe -u .\vision-sidecar\mage_vl_sidecar.py --port 12002
```

启动器支持 `-PythonPath 'D:\my-env\python.exe'` 和 `-Port 12003`，也读取 `MAGEVL_PORT`；显式 `-Port` 优先。改端口后同步修改 Node 的 `MAGEVL_SIDECAR_URL`。启动器从自身位置寻找脚本和默认虚拟环境，调用目录不受限制；不会自动安装依赖、下载模型、读取 `.env` 或另开后台窗口。终端保持运行，用 Ctrl+C 停止。

## 首次运行、离线与信任边界

模型懒加载，首次分析才下载权重并加载。`/health` 返回 `ready` 仅表示 HTTP 服务已启动，**不是已完成推理验证**；加载成功后为 `ok`。下载或 CPU 推理可能超过 Node 当前 180 秒分析超时，此时查看侧车终端进度，完成加载后在面板重新检查并重试。

加载使用 `trust_remote_code=True`，会执行模型仓库提供的 Python 代码；仅使用可信来源。需要完全离线时，联网阶段先下载完整模型（含自定义代码、配置和 tokenizer），并至少成功分析一次，再设置：

```powershell
$env:HF_HOME = "$PWD\vision-sidecar\.cache\huggingface"
.\vision-sidecar\.venv\Scripts\hf.exe download microsoft/Mage-VL --revision d88b153285f1633a61b2f693c59c8576693af185 --local-dir .\vision-sidecar\models\Mage-VL
$env:MAGEVL_MODEL = (Resolve-Path .\vision-sidecar\models\Mage-VL).Path
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
```

缓存和权重不入库。重新启动侧车使变量生效；修改模型或量化模式也必须重启侧车。

本机已验证的 E 盘布局可直接这样启动：

```powershell
$env:HF_HOME = 'E:\AI\HF'
$env:MAGEVL_MODEL = 'E:\AI\HF\hub\models--microsoft--Mage-VL\snapshots\d88b153285f1633a61b2f693c59c8576693af185'
$env:MAGEVL_QUANT = '4bit'
powershell -NoProfile -File .\vision-sidecar\start-magevl.ps1 -PythonPath E:\AI\magevl-env\Scripts\python.exe
```

注意：本机 `magevl-env/pyvenv.cfg` 的基础解释器仍是 `D:\Anaconda\envs\cosyvoice`。包和模型在 E 盘，但该虚拟环境尚不是可独立搬迁的完整 Python；不要删除/移动基础解释器。侧车依赖安装在 E 盘虚拟环境内，没有向基础环境安装。

该环境包含一个图像专用 `mamba_ssm` 桩包，只解决模型远程代码的静态导入检查；桩的 `create_block()` 会明确报错，不能冒充视频能力。以后实现视频流式门控时必须移除桩并安装真实 `mamba-ssm`。

下载为多 GB；可先完成上面的显式下载，再启动侧车，避免首次请求等待网络。如果浏览器可下载、命令行却超时，检查下载进程是否使用现有代理；必要时仅在当前终端设置 `HTTPS_PROXY` / `HTTP_PROXY` 为自己的代理地址，不需要修改系统代理或关闭安全软件。

## 验证与排障

先确认侧车在线：

```powershell
Invoke-RestMethod http://127.0.0.1:12002/health
```

返回示例：`status=ready, model=microsoft/Mage-VL, device=not-loaded`。随后打开应用的 Vision 面板，确认它通过 `/api/v1/vision/status` 显示该模型，再上传图片分析。面板离线时保留图片并禁用分析；修好后点击“重新检查”即可继续。

- **连接被拒绝/超时**：启动侧车，检查终端错误和 `MAGEVL_SIDECAR_URL`，确认端口一致。健康请求 5 秒超时；客户端状态请求 8 秒超时。
- **`ModuleNotFoundError` / 找不到 Python**：按安装步骤创建 `.venv`，用同一个 `python.exe -m pip` 安装依赖；启动器可传 `-PythonPath`。
- **CUDA / bitsandbytes 错误**：用上面的检查命令确认 CUDA 可用和驱动匹配；必要时设置 `MAGEVL_QUANT=none`，但这会增加内存需求。
- **Windows 加载时 `torch_cpu.dll` / `0xc0000005`**：侧车会自动把 Transformers 的 safetensors 后端从 `mmap` 临时切到低内存 `pread`，并串行装载权重；不要改成 `disable_mmap=True`，它会一次读入约 5 GB 分片，在 16 GB 内存机器上可能失败。
- **显存不足**：使用 4bit、缩小图片、关闭其他占用 GPU 的程序。单图服务不提供视频/实时流功能。
- **`/api/v1/vision/status` 返回 401/403**：这是 Node 的本机访问保护，不是侧车离线。重新打开桌面应用，或配置已有开发代理的临时访问凭据。不要关闭鉴权；直接用 PowerShell 调 Node API 需携带本次运行的 `x-arrodes-local-token`。
- **仍显示 DeepSeek/Ollama**：确认修改的是当前进程实际加载的 `server/.env`，并重启后端；不要修改聊天模型来切换视觉提供商。

无权重测试（测试环境额外需要 `httpx`；无需 torch/transformers）：

```powershell
python -m unittest discover -s .\vision-sidecar -p test_mage_vl_sidecar.py
```

模型调用接口参考 [微软官方单图推理示例](https://huggingface.co/microsoft/Mage-VL/blob/main/inference.py)：使用 causal LM、图像聊天模板、模型设备/精度对齐，并仅解码新生成的 token。
