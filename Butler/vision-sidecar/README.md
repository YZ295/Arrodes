# Qwen3-VL 本地视觉侧车

该侧车把现有 `/health` 与 `/analyze` 协议转发给本机 Ollama 的 `qwen3-vl:4b-instruct`。模型生命周期、量化和显存由 Ollama 管理，侧车本身不加载模型。

## 准备

```powershell
ollama pull qwen3-vl:4b-instruct
py -3.12 -m venv .\vision-sidecar\.venv
.\vision-sidecar\.venv\Scripts\python.exe -m pip install -r .\vision-sidecar\requirements.txt
```

## 启动

```powershell
.\vision-sidecar\.venv\Scripts\python.exe -u .\vision-sidecar\qwen_vl_sidecar.py --port 12002
```

可选环境变量：`OLLAMA_URL`、`QWEN_MODEL`、`QWEN_KEEP_ALIVE`、`QWEN_NUM_CTX`。

侧车只监听本机地址，不提供远程鉴权。不要暴露到局域网或公网。可用 `Invoke-RestMethod http://127.0.0.1:12002/health` 检查状态。

Node 主视觉服务默认直接调用 Ollama；该侧车供仍使用 `/analyze` 协议的管家活动汇总等 Python 调用方使用。
