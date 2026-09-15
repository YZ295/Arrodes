# Fun-CosyVoice3 TTS Sidecar（本地离线语音合成）

阿罗德斯的纯本地语音合成服务（FastAPI）。服务端 `cosyVoiceProxy` 在首次合成请求时懒启动本进程，之后所有 `/api/v1/tts/synthesize` 请求都经它完成。

## 架构

```
client useTTS
  └─ /api/v1/tts/synthesize（server，串行队列 + 指数退避重试）
       └─ cosyVoiceProxy（懒启动 + 健康检查 + 失败统计）
            └─ tts_sidecar.py（FastAPI :12003）
                 └─ Fun-CosyVoice3-0.5B-2512（本地模型，懒加载）
```

## 环境要求

- conda 环境 `cosyvoice3`（Python 3.10）
- torch（有 CUDA 用 GPU；无则自动回落 CPU）
- Fun-CosyVoice3-0.5B-2512 模型权重（当前完整包约 9.08 GB，放 `CosyVoice-unzip/cosyvoice-main/pretrained_models/Fun-CosyVoice3-0.5B-2512`）

下载权重：

```bash
modelscope download --model FunAudioLLM/Fun-CosyVoice3-0.5B-2512 --local_dir tts-sidecar/CosyVoice-unzip/cosyvoice-main/pretrained_models/Fun-CosyVoice3-0.5B-2512
```

## 启动

```powershell
.\start-cosyvoice3.ps1 `
  -ModelDir '.\CosyVoice-unzip\cosyvoice-main\pretrained_models\Fun-CosyVoice3-0.5B-2512' `
  -ProjectDir '.\CosyVoice-unzip\cosyvoice-main'
```

接口：`GET /health`（探活）、`POST /synthesize`（`{ text, voice, rate, promptWav?, promptText? }` → `{ audioPath, contentType, duration }`）。

## 与 server 的集成

- 路径：`cosyVoiceProxy` 按 `COSYVOICE_PROJECT_DIR` > 仓库内 `CosyVoice-unzip/cosyvoice-main` 定位模型项目；解释器按 `COSYVOICE3_PYTHON` > `COSYVOICE_PYTHON`（旧变量兼容）> 常见 `cosyvoice3` 环境查找
- 模型目录可用 `COSYVOICE3_MODEL_DIR` 覆盖；手动启动侧车时也可用 `COSYVOICE_MODEL_DIR`
- 默认端口为 `12003`，可用 `COSYVOICE3_PORT` / `COSYVOICE3_SIDECAR_URL` 覆盖
- 首次合成含模型加载（30-60s）；server 侧超时与重试已内置

## 目录约定（git 忽略项）

- `CosyVoice-unzip/`、`CosyVoice-src/`、`CosyVoice/`：模型/仓库，不入库
- `custom-voices/`：用户自定义音色（运行时数据），不入库
- `output/`、`mpl-cache/`、`.trash-test/`：运行时产物，不入库
- 源码（`tts_sidecar.py`、`requirements.txt`、`README.md`）入库
