"""
MOSS-TTS-Nano TTS Sidecar（替代 CosyVoice3，2026-09-09 切换）
=============================================================
本地离线语音合成服务（FastAPI）。对外接口契约与旧 CosyVoice3 版完全一致，
Node 端（cosyVoiceProxy.ts）无需改动调用方式。

职责：
- 懒加载 MOSS-TTS-Nano-100M-ONNX（CPU 推理，零 GPU 显存）
- POST /synthesize → 合成 wav（48kHz 双声道）→ ffmpeg atempo 变速 → 返回路径
- GET /health → 健康检查（供 Node 后端探活）

音色：
- voice 参数映射到 MOSS 内置音色；promptWav 存在时走参考音频克隆（优先于 voice）
- 默认女声 Lingyu（用户 2026-09-09 选定）

语速：
- MOSS 无原生语速控制，用 ffmpeg atempo 变速（保音高）
- 总语速 = 请求 rate × MOSS_SPEED（默认 1.25，用户指定）

启动：
  conda run -n moss-nano python tts_sidecar.py --port 12001

依赖（moss-nano 环境）：
  onnxruntime / torch(cpu) / torchaudio / WeTextProcessing / sentencepiece / soundfile / huggingface_hub
  模型：E:/AI/MOSS-TTS-Nano/models/{MOSS-TTS-Nano-100M-ONNX, MOSS-Audio-Tokenizer-Nano-ONNX}
"""
import argparse
import os
import shutil
import subprocess
import sys
import threading
import time
import wave
from pathlib import Path

# ===== MOSS-TTS-Nano 运行时目录（env MOSS_TTS_DIR 可覆盖，桌面打包版指向随包目录） =====
MOSS_DIR = Path(os.environ.get("MOSS_TTS_DIR", "E:/AI/MOSS-TTS-Nano"))
if not MOSS_DIR.exists():
    raise RuntimeError(f"MOSS-TTS-Nano 目录不存在: {MOSS_DIR}")
sys.path.insert(0, str(MOSS_DIR))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# ===== 默认语速倍率（用户 2026-09-09 指定 1.25） =====
DEFAULT_SPEED = float(os.environ.get("MOSS_SPEED", "1.25"))

# ===== UI 音色名 → MOSS 内置音色映射 =====
VOICES = {
    "default": "Lingyu",
    "female": "Lingyu",
    "lingyu": "Lingyu",
    "female2": "Yuewen",
    "yuewen": "Yuewen",
    "xiaoyu": "Xiaoyu",
    "male": "Junhao",
    "male2": "Zhiming",
    "english": "Bella",
    "japanese": "Saki",
    "korean": "Soyo",
}

OUTPUT_DIR = Path(os.environ.get("TTS_OUTPUT_DIR", str(Path(__file__).resolve().parent / "output")))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ===== runtime 懒加载单例（合成串行锁：ONNX session 并发安全未验证） =====
_runtime = None
_syn_lock = threading.Lock()


def get_runtime():
    global _runtime
    if _runtime is None:
        from onnx_tts_runtime import OnnxTtsRuntime

        print("[MOSS-TTS] 初始化 OnnxTtsRuntime（CPU，零显存）...")
        t0 = time.time()
        _runtime = OnnxTtsRuntime(
            model_dir=str(MOSS_DIR / "models"),
            thread_count=int(os.environ.get("MOSS_THREADS", "4")),
            execution_provider="cpu",
        )
        print(f"[MOSS-TTS] runtime 就绪 ({time.time() - t0:.1f}s)")
    return _runtime


def _atempo_chain(rate: float) -> str:
    """atempo 单值支持 0.5~2.0，超范围拆成链式过滤器。"""
    if rate <= 0:
        return None
    filters = []
    remaining = rate
    while remaining > 2.0:
        filters.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        filters.append("atempo=0.5")
        remaining /= 0.5
    filters.append(f"atempo={remaining:.4f}")
    return ",".join(filters)


def _apply_speed(wav_path: Path, rate: float) -> None:
    """ffmpeg atempo 变速（保持音高）。找不到 ffmpeg 则跳过并警告。"""
    if abs(rate - 1.0) < 1e-3:
        return
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print(f"[MOSS-TTS] 警告: 未找到 ffmpeg，跳过语速调整 (期望 {rate}x)")
        return
    tmp = wav_path.with_suffix(".speed.wav")
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-i", str(wav_path),
        "-filter:a", _atempo_chain(rate),
        "-c:a", "pcm_s16le",
        str(tmp),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    tmp.replace(wav_path)


# ===== FastAPI =====

app = FastAPI(title="MOSS-TTS-Nano Sidecar", version="2.0")


class SynthRequest(BaseModel):
    text: str
    voice: str = "default"
    rate: float = 1.0
    pitch: float = 1.0  # 兼容旧接口，MOSS 不支持音高调整，忽略
    # T9 自定义音色：参考音频路径（零样本克隆），存在时覆盖 voice
    promptWav: str | None = None
    promptText: str | None = None  # MOSS 克隆无需参考文本，兼容保留


class SynthResponse(BaseModel):
    audioPath: str
    contentType: str
    duration: float
    engine: str


@app.get("/health")
def health():
    return {"status": "ok", "engine": "moss-tts-nano", "device": "cpu"}


@app.post("/synthesize", response_model=SynthResponse)
def synthesize(req: SynthRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(400, "文本不能为空")
    if len(req.text) > 2000:
        raise HTTPException(400, "文本过长")

    total_rate = max(0.5, min(2.5, max(0.1, req.rate) * DEFAULT_SPEED))

    import hashlib
    text_hash = hashlib.md5(req.text.encode("utf-8")).hexdigest()[:8]
    out_path = OUTPUT_DIR / f"{int(time.time())}_{text_hash}.wav"

    try:
        with _syn_lock:
            runtime = get_runtime()
            t0 = time.time()
            prompt_wav = req.promptWav if (req.promptWav and Path(req.promptWav).exists()) else None
            if req.promptWav and not prompt_wav:
                print(f"[MOSS-TTS] 警告: 参考音频不存在，回退内置音色: {req.promptWav}")
            voice = VOICES.get((req.voice or "default").lower(), req.voice)
            result = runtime.synthesize(
                text=req.text,
                voice=voice,
                prompt_audio_path=str(prompt_wav) if prompt_wav else None,
                output_audio_path=str(out_path),
                sample_mode="fixed",
                streaming=True,
                voice_clone_max_text_tokens=75,
                enable_wetext=True,
                enable_normalize_tts_text=True,
            )
        _apply_speed(out_path, total_rate)
        duration = _get_wav_duration(out_path)
        print(
            f"[MOSS-TTS] 合成完成 ({time.time() - t0:.1f}s, {duration:.1f}s 音频, "
            f"{total_rate:.2f}x, voice={voice}{'|clone' if prompt_wav else ''}) -> {out_path.name}"
        )
        return SynthResponse(
            audioPath=str(out_path),
            contentType="audio/wav",
            duration=duration,
            engine="moss-tts-nano-local",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"合成失败: {e}")


def _get_wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / w.getframerate()


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=12001)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    print(f"[MOSS-TTS] Sidecar 启动中 ... (默认语速 {DEFAULT_SPEED}x)")
    uvicorn.run(app, host=args.host, port=args.port)
