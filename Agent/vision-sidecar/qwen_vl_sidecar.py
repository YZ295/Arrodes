# Qwen3-VL 视觉侧车——2026-09-09 起为阿罗德斯全项目统一视觉引擎（桌宠/管家后端/server 均走本进程）。
# 后端转发本机 Ollama：Ollama 已管理模型生命周期（显存/量化/常驻），
# 本进程只做协议转换，零模型加载、零 GPU 管理；管家所有调用方（butler.py 汇总、
# butler-app 问答、verify_refusal_live.py）因接口不变而零改动。
#
# 运行：qwen sidecar 需要 .venv（fastapi/uvicorn/pydantic）+ 本机 Ollama(:11434) 已拉取
#   qwen3-vl:4b-instruct（3.3GB，2026-08 初已存在）。
#   python -u qwen_vl_sidecar.py --port 12002
import argparse
import base64
import io
import json
import os
import time
import urllib.request

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Arrodes Qwen3-VL sidecar")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
QWEN_MODEL = os.environ.get("QWEN_MODEL", "qwen3-vl:4b-instruct")
KEEP_ALIVE = os.environ.get("QWEN_KEEP_ALIVE", "-1")  # -1 常驻显存，避免 10 分钟汇总周期内反复重载
# Ollama 默认 num_ctx=4096，问答拼接的检索材料实测 4248 token 直接 400
# （exceed_context_size_error）；qwen3-vl-4b 原生 32K，取 16384 平衡 8GB 显存下的 KV 占用
NUM_CTX = int(os.environ.get("QWEN_NUM_CTX", "16384"))

# 与 visionService.ts DEFAULT_VISION_PROMPT 保持一致（跨进程无共享包，人工同步）。
_DEFAULT_PROMPT = ("请详细描述这张图片中的内容，包括物体、场景、颜色、文字等。"
                   "只要能辨认出任何内容（界面、文字、图形、颜色布局），就必须直接描述，不要拒答。"
                   "仅当图片是纯噪声、纯色、全空白或完全无法辨认时，才回答：【信息不足】")


class AnalyzeRequest(BaseModel):
    image_base64: str
    prompt: str = _DEFAULT_PROMPT
    max_new_tokens: int = 1024


@app.get("/health")
async def health():
    # ollama_ok：真实探测 Ollama 可达性（sidecar 本身无状态，就绪与否取决于后端）
    ollama_ok = False
    try:
        with urllib.request.urlopen(OLLAMA_URL + "/api/tags", timeout=3) as r:
            ollama_ok = r.status == 200
    except Exception:
        pass
    return {"status": "ok" if ollama_ok else "degraded", "model": QWEN_MODEL,
            "device": "ollama", "ollama": ollama_ok}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.image_base64 or len(req.image_base64) < 100:
        raise HTTPException(status_code=400, detail="图片数据太短")

    from PIL import Image
    try:
        raw = base64.b64decode(req.image_base64, validate=True)
        Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail="图片数据无效") from e

    body = json.dumps({
        "model": QWEN_MODEL,
        "messages": [{"role": "user", "content": req.prompt,
                      "images": [req.image_base64]}],
        "stream": False,
        "options": {"num_predict": req.max_new_tokens, "temperature": 0,
                    "num_ctx": NUM_CTX},
        # Ollama keep_alive 只接受 数字(-1) 或时长字符串("30m")；"-1" 字符串会 400（实测）
        "keep_alive": int(KEEP_ALIVE) if KEEP_ALIVE.lstrip('-').isdigit() else KEEP_ALIVE,
    }).encode()
    http = urllib.request.Request(OLLAMA_URL + "/api/chat", data=body,
                                  headers={"Content-Type": "application/json"})

    t0 = time.time()
    try:
        # 生成超时按 token 上限给足余量（4B q4 在 4060 约 30-60 tok/s）
        with urllib.request.urlopen(http, timeout=600) as r:
            resp = json.loads(r.read().decode())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama 调用失败: {str(e)[:300]}") from e

    text = (resp.get("message") or {}).get("content", "").strip()
    return JSONResponse({
        "text": text,
        "duration_ms": int((time.time() - t0) * 1000),
        "model": QWEN_MODEL,
    })


if __name__ == "__main__":
    import uvicorn
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=12002)
    p.add_argument("--host", default="127.0.0.1")
    args = p.parse_args()
    print(f"[Qwen-VL] sidecar 启动 (port {args.port}, model={QWEN_MODEL}, ollama={OLLAMA_URL})")
    uvicorn.run(app, host=args.host, port=args.port)
