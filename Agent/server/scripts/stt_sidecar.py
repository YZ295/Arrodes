"""
Arrodes STT sidecar (faster-whisper, fully local)

Usage:
    python stt_sidecar.py [--port 12002] [--model small]

Endpoints:
    GET  /health       -> {status: ok|error, engine, model, loaded}
    POST /transcribe   -> JSON {audio_base64, filename} -> {text}

If faster-whisper is not installed, /health returns status=error and
/transcribe returns 503; the Arrodes server falls back to online mode.
"""

import argparse
import base64
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL = None
MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
LOADED = False
IMPORT_ERROR = None

try:
    from faster_whisper import WhisperModel  # type: ignore
except Exception as exc:  # pragma: no cover - environment dependent
    WhisperModel = None
    IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


def ensure_model():
    global MODEL, LOADED
    if LOADED:
        return True
    if WhisperModel is None:
        return False
    if MODEL is None:
        MODEL = WhisperModel(MODEL_NAME, device="auto", compute_type="auto")
    LOADED = True
    return True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # silence default logging
        return

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] != "/health":
            self._json(404, {"error": "not found"})
            return
        ok = WhisperModel is not None
        self._json(200, {
            "status": "ok" if ok else "error",
            "engine": "faster-whisper",
            "model": MODEL_NAME,
            "loaded": LOADED,
            "import_error": IMPORT_ERROR,
        })

    def do_POST(self):
        if self.path.split("?")[0] != "/transcribe":
            self._json(404, {"error": "not found"})
            return
        if not ensure_model():
            self._json(503, {"error": f"faster-whisper 不可用: {IMPORT_ERROR}"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            audio = base64.b64decode(payload.get("audio_base64", ""))
            if not audio:
                self._json(400, {"error": "audio_base64 为空"})
                return
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                tmp.write(audio)
                tmp_path = tmp.name
            try:
                segments, info = MODEL.transcribe(tmp_path, language="zh", vad_filter=True)
                text = "".join(seg.text for seg in segments).strip()
            finally:
                os.unlink(tmp_path)
            self._json(200, {"text": text, "language": info.language, "engine": "faster-whisper"})
        except Exception as exc:
            self._json(500, {"error": f"{type(exc).__name__}: {exc}"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=12002)
    parser.add_argument("--model", default=MODEL_NAME)
    args = parser.parse_args()
    global MODEL_NAME
    MODEL_NAME = args.model
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"[STT-sidecar] listening on http://127.0.0.1:{args.port} (model={MODEL_NAME})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
