# CosyVoice2 TTS Sidecar（本地离线语音合成）

阿罗德斯的纯本地语音合成服务（FastAPI）。服务端 `cosyVoiceProxy` 在首次合成请求时懒启动本进程，之后所有 `/api/v1/tts/synthesize` 请求都经它完成。

## 架构

```
client useTTS
  └─ /api/v1/tts/synthesize（server，串行队列 + 指数退避重试）
       └─ cosyVoiceProxy（懒启动 + 健康检查 + 失败统计）
            └─ tts_sidecar.py（FastAPI :12001）
                 └─ CosyVoice2-0.5B（本地模型，懒加载）
```

## 环境要求

- conda 环境 `cosyvoice`（Python 3.10）
- torch（有 CUDA 用 GPU；无则自动回落 CPU）
- CosyVoice2-0.5B 模型权重（约 5GB，放 `CosyVoice-unzip/cosyvoice-main/pretrained_models/CosyVoice2-0.5B`）

下载权重：

```bash
modelscope download --model iic/CosyVoice2-0.5B --local_dir tts-sidecar/CosyVoice-unzip/cosyvoice-main/pretrained_models/CosyVoice2-0.5B
```

或 HuggingFace：`huggingface-cli download --local-dir <同上> FunAudioLLM/CosyVoice2-0.5B`

## 启动

```bash
conda run -n cosyvoice python tts_sidecar.py --port 12001
```

接口：`GET /health`（探活）、`POST /synthesize`（`{ text, voice, rate, promptWav?, promptText? }` → `{ audioPath, contentType, duration }`）。

## 与 server 的集成

- 路径：`cosyVoiceProxy` 按 `COSYVOICE_PROJECT_DIR` > 仓库内 `CosyVoice-unzip/cosyvoice-main` 定位模型项目；conda 解释器按 `COSYVOICE_PYTHON` > 常见安装路径查找
- 模型目录可用 `COSYVOICE_MODEL_DIR` 覆盖
- 首次合成含模型加载（30-60s）；server 侧超时与重试已内置

## 目录约定（git 忽略项）

- `CosyVoice-unzip/`、`CosyVoice-src/`、`CosyVoice/`：模型/仓库，不入库
- `custom-voices/`：用户自定义音色（运行时数据），不入库
- `output/`、`mpl-cache/`、`.trash-test/`：运行时产物，不入库
- 源码（`tts_sidecar.py`、`requirements.txt`、`README.md`）入库
