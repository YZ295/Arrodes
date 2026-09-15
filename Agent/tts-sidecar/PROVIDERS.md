# Arrodes TTS providers

Arrodes 的服务端统一入口支持两个 provider：

- `cosyvoice3`：默认本地 sidecar，可由服务端自动启动。
- `audio8`：连接 Audio8 的 OpenAI 兼容 `/v1/audio/speech` 服务。

## CosyVoice3 启动

创建 `cosyvoice3` 环境并下载 `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`，然后运行：

```powershell
.\start-cosyvoice3.ps1 `
  -ModelDir 'D:\models\Fun-CosyVoice3-0.5B-2512' `
  -ProjectDir 'D:\src\CosyVoice'
```

通常无需手动启动：服务端首次合成时会在 `12003` 懒启动。非默认路径可在启动 Arrodes server 前设置：

```powershell
$env:COSYVOICE3_SIDECAR_URL = 'http://127.0.0.1:12003'
$env:COSYVOICE3_PYTHON = 'D:\Anaconda\envs\cosyvoice3\python.exe'
$env:COSYVOICE3_MODEL_DIR = 'D:\models\Fun-CosyVoice3-0.5B-2512'
```

## Audio8

先独立启动 Audio8 的 OpenAI 兼容服务，然后在启动 Arrodes server 的环境中设置：

```powershell
$env:AUDIO8_TTS_BASE_URL = 'http://127.0.0.1:12004/v1'
$env:AUDIO8_TTS_MODEL = 'audio8/tts-0.1b'
# 仅在服务要求鉴权时设置：
# $env:AUDIO8_TTS_API_KEY = '...'
```

重启 server 后，设置页会显示 provider 的实时“已配置/未配置”状态。未配置项不可选择；旧配置值 `cosyvoice2/server/local/edge/web` 会自动迁移到 `cosyvoice3`。
