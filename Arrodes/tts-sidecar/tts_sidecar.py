"""
CosyVoice 2 TTS Sidecar
=======================
本地离线语音合成服务（FastAPI）。

职责：
- 加载 CosyVoice2-0.5B 模型（懒加载，首次请求时初始化）
- POST /synthesize → 合成 wav 文件，返回路径
- GET /health → 健康检查（供 Node 后端探活）
- 启动时预热模型，避免首包过慢

启动：
  conda run -n cosyvoice python tts_sidecar.py --port 12001

依赖（cosyvoice 环境）：
  torch (CUDA) + CosyVoice 项目 requirements
"""
import argparse
import os
import sys
import time
import wave
from pathlib import Path

# CosyVoice 项目根（zip 解压目录：CosyVoice-unzip/cosyvoice-main）
# 优先级：环境变量 COSYVOICE_PROJECT_DIR（桌面打包版用，指向本机已有项目） > 自身目录
_env_project = os.environ.get("COSYVOICE_PROJECT_DIR") if os.environ.get("COSYVOICE_PROJECT_DIR") else None
if _env_project:
    COSYVOICE_DIR = Path(_env_project)
else:
    COSYVOICE_DIR = Path(__file__).resolve().parent / "CosyVoice-unzip" / "cosyvoice-main"
    if not COSYVOICE_DIR.exists():
        # 兼容 git 克隆目录名
        COSYVOICE_DIR = Path(__file__).resolve().parent / "CosyVoice-src"
    if not COSYVOICE_DIR.exists():
        COSYVOICE_DIR = Path(__file__).resolve().parent / "CosyVoice"
sys.path.insert(0, str(COSYVOICE_DIR))

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ===== 模型加载（懒加载 + 全局单例） =====

_model = None
_device = None


def load_model():
    """加载 CosyVoice2-0.5B（仅首次调用）"""
    global _model, _device
    if _model is not None:
        return _model, _device

    import torch
    from cosyvoice.cli.cosyvoice import CosyVoice2

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[CosyVoice] 设备: {_device}（{'CUDA ' + torch.cuda.get_device_name(0) if _device == 'cuda' else 'CPU'}）")

    model_dir = os.environ.get(
        "COSYVOICE_MODEL_DIR",
        str(COSYVOICE_DIR / "pretrained_models" / "CosyVoice2-0.5B"),
    )
    if not Path(model_dir).exists():
        raise RuntimeError(
            f"模型目录不存在: {model_dir}\n"
            "请先下载 CosyVoice2-0.5B 权重并放到该目录：\n"
            "  huggingface-cli download --local-dir pretrained_models/CosyVoice2-0.5B FunAudioLLM/CosyVoice2-0.5B\n"
            "或从 ModelScope: modelscope download --model iic/CosyVoice2-0.5B --local_dir pretrained_models/CosyVoice2-0.5B"
        )

    print(f"[CosyVoice] 加载模型: {model_dir} ...")
    t0 = time.time()
    _model = CosyVoice2(model_dir, load_jit=False, load_trt=False, fp16=(_device == "cuda"))
    print(f"[CosyVoice] 模型加载完成 ({time.time() - t0:.1f}s)")
    return _model, _device


# ===== FastAPI =====

app = FastAPI(title="CosyVoice TTS Sidecar", version="1.0")

OUTPUT_DIR = Path(__file__).resolve().parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# 预设音色（CosyVoice2 内置 speaker id，无需参考音频）
VOICES = {
    "default": "中文女",
    "female": "中文女",
    "male": "中文男",
    "female2": "粤语女",
    "male2": "粤语男",
    "english": "英文女",
    "japanese": "日语男",
    "korean": "韩语女",
}


class SynthRequest(BaseModel):
    text: str
    voice: str = "default"
    rate: float = 1.0
    pitch: float = 1.0
    # T9 自定义音色：上传的参考音频路径（zero-shot 克隆）+ 配套提示文本
    promptWav: str | None = None
    promptText: str | None = None


class SynthResponse(BaseModel):
    audioPath: str
    contentType: str
    duration: float
    engine: str = "cosyvoice2-local"


@app.get("/health")
def health():
    return {"status": "ok", "engine": "cosyvoice2", "device": _device or "not-loaded"}


@app.post("/synthesize", response_model=SynthResponse)
def synthesize(req: SynthRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(400, "文本不能为空")
    if len(req.text) > 2000:
        raise HTTPException(400, "文本过长")

    try:
        model, device = load_model()
    except RuntimeError as e:
        raise HTTPException(500, str(e))

    # 生成文件名：时间戳 + 哈希
    import hashlib
    text_hash = hashlib.md5(req.text.encode("utf-8")).hexdigest()[:8]
    out_path = OUTPUT_DIR / f"{int(time.time())}_{text_hash}.wav"

    # 用 inference_zero_shot：参考音频提取音色（CosyVoice2 官方主推用法）
    # 注意：CosyVoice2-0.5B 模型不包含 spk2info.pt，SFT 模式无内置音色，必须用 zero_shot
    # 注意：prompt_wav 传文件路径字符串（inference_zero_shot 内部自行加载），勿传 tensor
    try:
        t0 = time.time()
        # T9 自定义音色：promptWav 存在则用上传的参考音频，否则用仓库默认
        ref_wav = req.promptWav or (COSYVOICE_DIR / "asset" / "zero_shot_prompt.wav")
        if isinstance(ref_wav, str):
            ref_wav = Path(ref_wav)
        if not Path(ref_wav).exists():
            raise RuntimeError(f"缺少参考音频: {ref_wav}（需从 CosyVoice 仓库 asset/ 目录获取 zero_shot_prompt.wav，或上传自定义参考音频）")
        prompt_text = req.promptText or "希望你以后能够做的比我还好呦。"
        for chunk in model.inference_zero_shot(
            req.text,
            prompt_text,  # prompt 文本（与参考音频配套）
            str(ref_wav),  # 传路径字符串
            stream=False,
            speed=req.rate,
        ):
            _write_chunk(chunk, out_path, model.sample_rate)

        duration = _get_wav_duration(out_path)
        print(f"[CosyVoice] 合成完成 ({time.time() - t0:.1f}s, {duration:.1f}s 音频) -> {out_path.name}")
        return SynthResponse(
            audioPath=str(out_path),
            contentType="audio/wav",
            duration=duration,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"合成失败: {e}")


def _write_chunk(chunk, out_path: Path, sample_rate: int = 24000):
    """CosyVoice 流式 chunk 写入 wav（第一个 chunk 初始化文件）

    注意：CosyVoice2 的 chunk 只有 {'tts_speech'}，sample_rate 从模型全局取（默认 24000）。
    """
    if not hasattr(_write_chunk, "_fh") or _write_chunk._fh is None:
        # chunk 是 {tts_speech} dict（无 sample_rate 字段）
        if isinstance(chunk, dict):
            _write_chunk._sr = sample_rate
            _write_chunk._fh = wave.open(str(out_path), "wb")
            _write_chunk._fh.setnchannels(1)
            _write_chunk._fh.setsampwidth(2)
            _write_chunk._fh.setframerate(sample_rate)
        else:
            raise ValueError("意外的 chunk 类型")
    if isinstance(chunk, dict):
        audio = chunk["tts_speech"].squeeze(0).detach().cpu().numpy()
        import numpy as np
        pcm = (audio * 32767).astype(np.int16)
        _write_chunk._fh.writeframes(pcm.tobytes())


def _close_wav():
    if hasattr(_write_chunk, "_fh") and _write_chunk._fh is not None:
        _write_chunk._fh.close()
        _write_chunk._fh = None


def _get_wav_duration(path: Path) -> float:
    _close_wav()
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / w.getframerate()


# 启动时预热（可选，加快首包）
# @app.on_event("startup")
# def warmup():
#     try:
#         load_model()
#     except Exception as e:
#         print(f"[CosyVoice] 预热失败: {e}")


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=12001)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    print("[CosyVoice] Sidecar 启动中 ...")
    uvicorn.run(app, host=args.host, port=args.port)
