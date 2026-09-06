"""
Mage-VL 视觉 Sidecar（微软 4B 流式 VLM）

供 Arrodes 后端通过 HTTP 调用（visionService VISION_PROVIDER=magevl）：
- POST /analyze   {image_base64, prompt} -> {text, duration_ms, model}
- GET  /health    -> {status, model, device}

模型懒加载（首次请求时初始化，之后常驻）。
CUDA 默认 4bit 量化；CPU 使用 float32、不量化。
可用环境变量调整：
  MAGEVL_QUANT   = 4bit | 8bit | none（默认 4bit）
  MAGEVL_MODEL   = 模型 ID（默认 microsoft/Mage-VL）

安装与 Windows 启动步骤见同目录 README.md 和 requirements.txt。
首次请求会下载模型并执行 trust_remote_code；仅使用可信模型仓库。
"""
import argparse
import base64
from contextlib import contextmanager
import importlib
import io
import os
import time
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="Mage-VL Sidecar")

# ===== 模型加载（懒加载 + 全局单例） =====

_model = None
_processor = None
_device = None
_model_name = None
_load_lock = Lock()
_inference_lock = Lock()


@contextmanager
def windows_pread_weights():
    """Avoid safetensors mmap access violations without loading whole shards into RAM."""
    if os.name != "nt":
        yield
        return

    modeling_utils = importlib.import_module("transformers.modeling_utils")
    original_safe_open = modeling_utils.safe_open
    previous_async_setting = os.environ.get("HF_DEACTIVATE_ASYNC_LOAD")

    def pread_safe_open(*args, **kwargs):
        kwargs["backend"] = "pread"
        return original_safe_open(*args, **kwargs)

    modeling_utils.safe_open = pread_safe_open
    os.environ["HF_DEACTIVATE_ASYNC_LOAD"] = "1"
    try:
        yield
    finally:
        modeling_utils.safe_open = original_safe_open
        if previous_async_setting is None:
            os.environ.pop("HF_DEACTIVATE_ASYNC_LOAD", None)
        else:
            os.environ["HF_DEACTIVATE_ASYNC_LOAD"] = previous_async_setting


def load_model():
    with _load_lock:
        return _load_model()


def _load_model():
    """加载 microsoft/Mage-VL（仅首次调用）"""
    global _model, _processor, _device, _model_name
    if _model is not None:
        return _model, _processor, _device, _model_name

    import torch

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[Mage-VL] 设备: {device}")

    model_id = os.environ.get("MAGEVL_MODEL", "microsoft/Mage-VL")
    quant = os.environ.get("MAGEVL_QUANT", "4bit").lower()
    if quant not in {"4bit", "8bit", "none"}:
        raise ValueError("MAGEVL_QUANT 必须为 4bit、8bit 或 none")

    kwargs = dict(trust_remote_code=True, torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
                  device_map="auto" if device == "cuda" else "cpu")
    if quant == "4bit" and device == "cuda":
        from transformers import BitsAndBytesConfig
        kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_use_double_quant=True,
        )
    elif quant == "8bit" and device == "cuda":
        from transformers import BitsAndBytesConfig
        kwargs["quantization_config"] = BitsAndBytesConfig(load_in_8bit=True)

    from transformers import AutoModelForCausalLM, AutoProcessor

    print(f"[Mage-VL] 加载模型: {model_id} (quant={quant}) ...")
    t0 = time.time()
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)
    with windows_pread_weights():
        model = AutoModelForCausalLM.from_pretrained(model_id, **kwargs).eval()
    # Publish only a fully initialized pair, so a failed load can be retried.
    _model, _processor, _device = model, processor, device
    _model_name = model_id
    print(f"[Mage-VL] 模型加载完成 ({time.time() - t0:.1f}s)")
    return _model, _processor, _device, _model_name


# ===== API =====


class AnalyzeRequest(BaseModel):
    image_base64: str
    prompt: str = "请详细描述这张图片中的内容，包括物体、场景、颜色、文字等。"
    max_new_tokens: int = 1024


@app.get("/health")
async def health():
    status = "ok" if _model is not None else "ready"
    return {"status": status, "model": _model_name or os.environ.get("MAGEVL_MODEL", "microsoft/Mage-VL"),
            "device": _device or "not-loaded"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.image_base64 or len(req.image_base64) < 100:
        raise HTTPException(status_code=400, detail="图片数据太短")

    from PIL import Image
    try:
        raw = base64.b64decode(req.image_base64, validate=True)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail="图片数据无效") from e

    try:
        model, processor, device, model_name = load_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"模型加载失败: {str(e)[:300]}")

    t0 = time.time()
    try:
        import torch
        messages = [{"role": "user", "content": [
            {"type": "image"}, {"type": "text", "text": req.prompt},
        ]}]
        prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = processor(
            text=[prompt], images=[image],
            return_tensors="pt",
        )
        inputs = {key: value.to(model.device) if hasattr(value, "to") else value
                  for key, value in inputs.items()}
        if "pixel_values" in inputs:
            inputs["pixel_values"] = inputs["pixel_values"].to(model.dtype)

        with _inference_lock, torch.inference_mode():
            outputs = model.generate(
                **inputs,
                max_new_tokens=req.max_new_tokens,
                do_sample=False,
                repetition_penalty=1.15,
            )
        text = processor.tokenizer.decode(
            outputs[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True,
        ).strip()

        return JSONResponse({
            "text": text,
            "duration_ms": int((time.time() - t0) * 1000),
            "model": model_name,
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"推理失败: {str(e)[:300]}")


if __name__ == "__main__":
    import uvicorn
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=12002)
    args = p.parse_args()
    print(f"[Mage-VL] sidecar 启动 (port {args.port})")
    uvicorn.run(app, host="127.0.0.1", port=args.port)
