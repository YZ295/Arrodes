# -*- coding: utf-8 -*-
"""
阿罗德斯管家（Butler）——定时截屏 + 10 分钟时段汇总（本地 Qwen3-VL）
==================================================================

架构（v2）：
  采集线程：每 20 秒截主屏，变化检测（无变化写 unchanged 轻记录），图片落盘。
            不再做逐条模型分析。
  汇总线程：扫描"已结束但尚无汇总"的 10 分钟段（历史段自动排队补），逐段调用
            Qwen3-VL /analyze：代表截图 + 上一时段汇总作为上下文，输出结构化 JSON：
            {project, category, description(约1000字), software[], todos[]}
            写入 summaries/{YYYYMMDD}.json；处理状态写 _butler/state.json 供 UI 显示。

数据落盘（DATA_DIR，默认 E:\\project\\HermesProject\\Obsidian\\TheFool）：
  {月}/{YYYYMMDD_HH}.json     每小时原始记录（ts/image/status，status=raw|unchanged）
  {月}/images/*.jpg           截图
  {月}/summaries/{YYYYMMDD}.json  每天一个，segments[]（每 10 分钟一段的结构化汇总）
  _butler/state.json          汇总进度状态（UI 的"汇总中"标记数据源）
  _butler/butler.log          运行日志（轮转）

用法：
  python butler.py                 # 常驻运行（Ctrl+C 停止）
  python butler.py --once          # 单次采集后退出（自检）
  python butler.py --backfill      # 立即消费所有待汇总段（前台跑完才退）
  可选：--interval 20 --data-dir <path> --sidecar-url <url> --timeout 900
"""

import argparse
import base64
import json
import logging
import os
import sys
import threading
import time
import urllib.request
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from pathlib import Path

from PIL import Image, ImageChops, ImageGrab

# ---------- 默认配置 ----------
DEFAULT_DATA_DIR = r"E:\project\HermesProject\Obsidian\TheFool"
DEFAULT_SIDECAR = "http://127.0.0.1:12012"
DEFAULT_INTERVAL = 20          # 秒
DEFAULT_TIMEOUT = 900          # /analyze 超时（秒）：1000 字生成在 4060 上约 4-6 分钟
HEALTH_TIMEOUT = 3
DIFF_THRESHOLD = 2.0           # 64x64 灰度差均值超过该值视为画面变化
JPEG_QUALITY = 60
MAX_NEW_TOKENS = 2048          # 1000 字中文 ≈ 1600 token
IMAGES_PER_SEGMENT = 3         # 每段最多附带的代表截图数

CATEGORIES = ("娱乐", "工作", "学习", "社交")
UNCATEGORIZED = "未分类"
SEG_STATUS_DONE = "done"
SEG_STATUS_FAILED = "failed"

PROMPT_SUMMARIZE = (
    "你是屏幕活动分析助手。以下是用户 {date} {start}-{end} 这个十分钟时段的屏幕记录：\n"
    "附图是该时段的代表截图；该时段共采样 {samples} 帧（每 20 秒一帧，画面有变化才保存）。\n"
    "{prev_block}"
    "请根据截图与上述信息，输出严格的 JSON 对象（禁止 markdown 代码块，禁止任何解释文字），字段：\n"
    '{{"project": "简短项目名，如 玩《荒野大镖客》、写《2026年中报告》；与上一时段是同一活动时必须沿用相同名称；此项不能为空字符串",'
    ' "category": "娱乐|工作|学习|社交|未分类 五选一",'
    ' "summary_line": "一句话概括该时段活动，不能为空",'
    ' "software": ["该时段用到的软件/网站名"],'
    ' "todos": ["可能被遗漏的重要待办事项，没有则空数组"]}}'
)

# 四段扩写：4B 模型无法在 JSON 里写 1000 字，改为分段调用后本地拼接
SEGMENT_EXPANDS = [
    ("【活动概述】", "约250字。说明用户在这十分钟里在做什么、使用什么设备软件、这个活动的目的可能是什么。"),
    ("【软件与操作】", "约300字。逐一说明截图中可见的软件、网页或文档界面，以及用户可能正在执行的具体操作步骤。"),
    ("【屏幕内容细节】", "约300字。详细描述截图中可见的具体界面元素、窗口布局、文字内容、按钮、列表、文档或页面的主题细节。"),
    ("【进展与总结】", "约250字。总结这十分钟完成了什么、当前处于什么阶段、接下来可能做什么，如有迹象说明是否遇到问题。"),
]


def expand_prompt(date_fmt: str, start: str, end: str, samples: int,
                  title: str, requirement: str, summary_ctx: str) -> str:
    return (
        f"你是屏幕活动分析助手。用户 {date_fmt} {start}-{end} 的屏幕截图附后（该时段共采样 {samples} 帧）。"
        f"{summary_ctx}"
        f"请只输出以下内容，不要任何前后缀：\n{title}\n{requirement}\n"
        "要求：基于截图中的真实细节具体描述，写到接近要求的字数，禁止空洞套话、禁止重复标题以外的多余文字。"
    )


# ---------- 日志 ----------
log = logging.getLogger("butler")


def setup_logging(data_dir: Path) -> None:
    log.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    log_dir = data_dir / "_butler"
    log_dir.mkdir(parents=True, exist_ok=True)
    fh = RotatingFileHandler(log_dir / "butler.log", maxBytes=2 * 1024 * 1024,
                             backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    log.addHandler(fh)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(sh)


# ---------- 原子写工具 ----------
def atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


# ---------- 原始记录写入（锁保护） ----------
class RecordStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self._lock = threading.Lock()

    def append(self, ts: datetime, image: str | None, status: str, **extra) -> None:
        month_dir = self.data_dir / ts.strftime("%Y-%m")
        hour_file = month_dir / ts.strftime("%Y%m%d_%H.json")
        rec = {
            "ts": ts.isoformat(timespec="seconds"),
            "image": image,
            "status": status,
        }
        rec.update(extra)
        with self._lock:
            try:
                month_dir.mkdir(parents=True, exist_ok=True)
                if hour_file.exists():
                    data = json.loads(hour_file.read_text(encoding="utf-8"))
                else:
                    data = {"hour": ts.strftime("%Y-%m-%dT%H:00"), "records": []}
                data["records"].append(rec)
                atomic_write_json(hour_file, data)
            except Exception:
                log.exception("写入记录失败 %s", hour_file)


# ---------- 侧车调用 ----------
def sidecar_reachable(base_url: str) -> bool:
    try:
        with urllib.request.urlopen(base_url + "/health", timeout=HEALTH_TIMEOUT) as r:
            json.loads(r.read().decode("utf-8"))
        return True
    except Exception:
        return False


def analyze_image(base_url: str, image_path: Path, prompt: str,
                  timeout: int, max_new_tokens: int) -> tuple[str, dict]:
    raw = image_path.read_bytes()
    body = json.dumps({
        "image_base64": base64.b64encode(raw).decode("ascii"),
        "prompt": prompt,
        "max_new_tokens": max_new_tokens,
    }).encode("utf-8")
    req = urllib.request.Request(
        base_url + "/analyze", data=body,
        headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return (data.get("text") or "").strip(), {
        "model": data.get("model"), "analyze_ms": data.get("duration_ms"),
    }


# ---------- 变化检测 ----------
def gray_signature(img: Image.Image) -> Image.Image:
    return img.convert("L").resize((64, 64))


def diff_mean(a: Image.Image, b: Image.Image) -> float:
    h = ImageChops.difference(a, b).histogram()
    total = sum(h)
    if total == 0:
        return 0.0
    return sum(v * n for v, n in enumerate(h)) / total


# ---------- 采集线程 ----------
def capture_once(cfg, store: RecordStore, state) -> None:
    ts = datetime.now().astimezone()
    try:
        img = ImageGrab.grab()
        sig = gray_signature(img)
        last_sig = state["last_sig"]
        if last_sig is not None and diff_mean(sig, last_sig) <= cfg.diff_threshold:
            store.append(ts, state["last_image"], "unchanged")  # 屏幕无变化
            return
        month_dir = cfg.data_dir / ts.strftime("%Y-%m")
        img_dir = month_dir / "images"
        img_dir.mkdir(parents=True, exist_ok=True)
        path = img_dir / ts.strftime("%Y%m%d_%H%M%S.jpg")
        img.convert("RGB").save(path, "JPEG", quality=cfg.jpeg_quality)
        state["last_sig"] = sig
        state["last_image"] = str(path)
        store.append(ts, str(path), "raw")
    except Exception:
        state["cap_fails"] = state.get("cap_fails", 0) + 1
        if state["cap_fails"] == 1 or state["cap_fails"] % 10 == 0:
            log.exception("截屏失败（连续 %d 次），下轮重试", state["cap_fails"])


def capture_loop(cfg, store: RecordStore, state) -> None:
    while state["running"]:
        t0 = time.monotonic()
        capture_once(cfg, store, state)
        elapsed = time.monotonic() - t0
        state["stop_event"].wait(max(0.1, cfg.interval - elapsed))


# ---------- 10 分钟段扫描与汇总 ----------
def slot_str(idx: int) -> str:
    """桶序号(0-143) -> 'HH:MM'（段尾 144 -> '24:00'）。"""
    if idx >= 144:
        return "24:00"
    return f"{idx // 6:02d}:{(idx % 6) * 10:02d}"


def load_segments_file(data_dir: Path, ymd: str) -> dict:
    month = f"{ymd[:4]}-{ymd[4:6]}"
    f = data_dir / month / "summaries" / f"{ymd}.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            log.exception("汇总文件损坏 %s", f)
    return {"date": f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}", "segments": []}


def save_segments_file(data_dir: Path, ymd: str, data: dict) -> None:
    month_dir = data_dir / f"{ymd[:4]}-{ymd[4:6]}"
    out_dir = month_dir / "summaries"
    out_dir.mkdir(parents=True, exist_ok=True)
    atomic_write_json(out_dir / f"{ymd}.json", data)


def scan_pending_segments(data_dir: Path) -> list[dict]:
    """扫描所有已结束但尚无成功汇总的 10 分钟段，按时间正序。
    返回 [{ymd, idx, samples, images[], start, end}]。failed 段跳过（不自动重试）。"""
    now = datetime.now().astimezone()
    cur_idx = now.hour * 6 + now.minute // 10
    today = now.strftime("%Y%m%d")
    pending: dict[tuple, dict] = {}

    for month_dir in sorted(data_dir.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9]")):
        for hf in sorted(month_dir.glob("[0-9]" * 8 + "_[0-9][0-9].json")):
            ymd = hf.name[:8]
            try:
                data = json.loads(hf.read_text(encoding="utf-8"))
            except Exception:
                continue
            for r in data.get("records", []):
                try:
                    t = datetime.fromisoformat(r["ts"])
                except (TypeError, ValueError, KeyError):
                    continue
                idx = t.hour * 6 + t.minute // 10
                if t.strftime("%Y%m%d") == today and idx >= cur_idx:
                    continue  # 尚未结束的段
                key = (ymd, idx)
                b = pending.setdefault(key, {"samples": 0, "images": []})
                b["samples"] += 1
                if r.get("status") in ("raw", "ok", "unchanged") and r.get("image"):
                    b["images"].append(r["image"])  # unchanged 复用图也参与，保底有代表帧

    segs = []
    for (ymd, idx), b in sorted(pending.items()):
        # done 或已人工修正的段不再入队（edited 段即使 failed 也不重算，避免冲掉人工数据）
        skip = {s.get("start") for s in load_segments_file(data_dir, ymd)["segments"]
                if s.get("status") == SEG_STATUS_DONE or s.get("edited")}
        if slot_str(idx) in skip:
            continue
        images = list(dict.fromkeys(b["images"]))  # 去重保序（unchanged 复用同图）
        segs.append({"ymd": ymd, "idx": idx, "samples": b["samples"],
                     "images": images,
                     "start": slot_str(idx), "end": slot_str(idx + 1)})
    return segs


def pick_images(images: list[str], n: int) -> list[str]:
    """从变化帧里均匀取 n 张代表截图（首/中/尾）。"""
    if len(images) <= n:
        return images
    step = (len(images) - 1) / (n - 1)
    return [images[round(i * step)] for i in range(n)]


def parse_summary_json(text: str, start: str, end: str) -> dict:
    """解析结构化 JSON（项目/分类/一句话概括/软件/待办）；失败时降级。"""
    i, j = text.find("{"), text.rfind("}")
    if 0 <= i < j:
        try:
            d = json.loads(text[i:j + 1])
            project = str(d.get("project") or "").strip()
            if project:
                category = str(d.get("category") or "").strip()
                if category not in CATEGORIES:
                    for c in CATEGORIES:
                        if category.startswith(c):
                            category = c
                            break
                    else:
                        category = UNCATEGORIZED
                return {
                    "project": project,
                    "category": category or UNCATEGORIZED,
                    "summary_line": str(d.get("summary_line") or "").strip(),
                    "software": [str(s).strip() for s in (d.get("software") or []) if str(s).strip()],
                    "todos": [str(s).strip() for s in (d.get("todos") or []) if str(s).strip()],
                    "_degraded": False,
                }
        except Exception:
            pass
    return {"project": f"{start}-{end} 屏幕活动", "category": UNCATEGORIZED,
            "summary_line": text.strip()[:200], "software": [], "todos": [],
            "_degraded": True}


def prev_segment_context(data_dir: Path, ymd: str, idx: int) -> str:
    """取时间上最近的一个已完成段（含前一日末段），作为连续性上下文。"""
    candidates = []
    for d_off in (0, -1):
        d = datetime.strptime(ymd, "%Y%m%d") + timedelta(days=d_off)
        y = d.strftime("%Y%m%d")
        for s in load_segments_file(data_dir, y).get("segments", []):
            if s.get("status") != SEG_STATUS_DONE or s.get("idx") is None:
                continue
            if d_off == 0 and s["idx"] >= idx:
                continue
            candidates.append((y, s))
    if not candidates:
        ymd_prev = (datetime.strptime(ymd, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
        for s in load_segments_file(data_dir, ymd_prev).get("segments", []):
            if s.get("status") == SEG_STATUS_DONE and s.get("idx") is not None:
                candidates.append((ymd_prev, s))
    if not candidates:
        return "上一时段无汇总（本时段是记录的开头）。\n"
    _, s = candidates[-1]
    prev = {"project": s.get("project"), "category": s.get("category"),
            "time": f"{s.get('start')}-{s.get('end')}"}
    return f"上一时段的汇总结果：{json.dumps(prev, ensure_ascii=False)}\n"


def mark_segment(data_dir: Path, ymd: str, seg_obj: dict) -> None:
    data = load_segments_file(data_dir, ymd)
    # 人工修正保护：用户编辑过的段（edited）不允许被引擎覆盖
    existing = next((s for s in data["segments"]
                     if s.get("idx") == seg_obj.get("idx")), None)
    if existing and existing.get("edited") and not seg_obj.get("edited"):
        log.warning("段 %s %s 已被人工修正，跳过引擎覆盖", ymd, seg_obj.get("start"))
        return
    data["segments"] = [s for s in data["segments"]
                        if s.get("idx") != seg_obj.get("idx")] + [seg_obj]
    data["segments"].sort(key=lambda s: s.get("idx", 0))
    save_segments_file(data_dir, ymd, data)


def process_segment(cfg, seg: dict) -> None:
    """一段 = 1 次结构化 JSON 调用 + 4 次分段扩写调用，本地拼接约 1000 字描述。"""
    ymd, idx = seg["ymd"], seg["idx"]
    images = pick_images(seg["images"], IMAGES_PER_SEGMENT)
    if not images:
        log.warning("段 %s %s 无变化帧，标记失败跳过", ymd, seg["start"])
        mark_segment(cfg.data_dir, ymd, {
            "idx": idx, "start": seg["start"], "end": seg["end"],
            "status": SEG_STATUS_FAILED, "error": "no images",
            "samples": seg["samples"], "images": []})
        return
    main_image = Path(images[-1])  # 最后一张（最新画面）作为主分析图
    prev_ctx = prev_segment_context(cfg.data_dir, ymd, idx)
    date_fmt = f"{ymd[:4]}年{int(ymd[4:6])}月{int(ymd[6:8])}日"

    # 1) 结构化字段（模型偶发输出空 JSON，最多重试 3 次）
    parsed = None
    for attempt in range(3):
        retry_note = (f"\n注意：这是第 {attempt + 1} 次请求，之前的回答 project 为空。"
                      if attempt else "")
        text, meta = analyze_image(
            cfg.sidecar_url, main_image,
            PROMPT_SUMMARIZE.format(date=date_fmt, start=seg["start"],
                                    end=seg["end"], samples=seg["samples"],
                                    prev_block=prev_ctx) + retry_note,
            cfg.timeout, 512)
        parsed = parse_summary_json(text, seg["start"], seg["end"])
        if not parsed.get("_degraded"):
            break
        log.warning("段 %s %s 结构化输出无效（第 %d 次），重试",
                    ymd, seg["start"], attempt + 1)
        time.sleep(1)

    # 2) 四段扩写 -> 拼接长描述
    ctx = (f"已知该时段活动：{parsed['project']}（{parsed['category']}）。"
           f"一句话概括：{parsed['summary_line']}\n")
    parts = []
    for title, req in SEGMENT_EXPANDS:
        try:
            t, _ = analyze_image(
                cfg.sidecar_url, main_image,
                expand_prompt(date_fmt, seg["start"], seg["end"],
                              seg["samples"], title, req, ctx),
                cfg.timeout, 768)
            if t.strip():
                body = t.strip()
                parts.append(body if body.startswith(title) else f"{title}\n{body}")
        except Exception as e:
            log.warning("扩写 %s 失败：%s", title, f"{type(e).__name__}: {e}"[:120])
    description = "\n\n".join(parts) or parsed["summary_line"]

    seg_obj = {
        "idx": idx, "start": seg["start"], "end": seg["end"],
        "status": SEG_STATUS_DONE,
        "project": parsed["project"], "category": parsed["category"],
        "description": description, "software": parsed["software"],
        "todos": parsed["todos"],
        "images": images, "samples": seg["samples"],
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        **meta,
    }
    mark_segment(cfg.data_dir, ymd, seg_obj)
    log.info("段汇总完成 %s %s-%s [%s] %s（描述 %d 字）",
             ymd, seg["start"], seg["end"], parsed["category"],
             parsed["project"], len(description))


def write_state(cfg, summarizing: bool, current: dict | None, queue: int) -> None:
    try:
        atomic_write_json(cfg.data_dir / "_butler" / "state.json", {
            "summarizing": summarizing,
            "current": current,
            "queue": queue,
            "updated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        })
    except Exception:
        log.exception("写状态文件失败")


def summarize_loop(cfg, state) -> None:
    """汇总消费循环：扫描 -> 处理 -> 循环；空闲时 30s 一扫。失败段标 failed 防死循环。"""
    while state["running"]:
        try:
            segs = scan_pending_segments(cfg.data_dir)
        except Exception:
            log.exception("扫描待汇总段失败")
            segs = []
        if not segs:
            write_state(cfg, False, None, 0)
            state["stop_event"].wait(30)
            state["stop_event"].clear()
            continue
        seg = segs[0]
        write_state(cfg, True, {"date": seg["ymd"], "start": seg["start"],
                                "end": seg["end"]}, len(segs))
        if not sidecar_reachable(cfg.sidecar_url):
            log.warning("侧车不在线，汇总暂停（30 秒后重试；已截图数据不丢失）")
            write_state(cfg, False, None, len(segs))
            state["stop_event"].wait(30)
            state["stop_event"].clear()
            continue
        try:
            process_segment(cfg, seg)
        except Exception as e:
            log.exception("段汇总失败 %s %s", seg["ymd"], seg["start"])
            try:
                mark_segment(cfg.data_dir, seg["ymd"], {
                    "idx": seg["idx"], "start": seg["start"], "end": seg["end"],
                    "status": SEG_STATUS_FAILED,
                    "error": f"{type(e).__name__}: {e}"[:200],
                    "samples": seg["samples"],
                    "images": pick_images(seg["images"], IMAGES_PER_SEGMENT)})
            except Exception:
                log.exception("写失败段标记失败")
        state["stop_event"].wait(0.2)
        state["stop_event"].clear()


# ---------- DPI / 入口 ----------
def enable_dpi_awareness() -> None:
    try:
        import ctypes
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="阿罗德斯管家：定时截屏 + 10 分钟时段汇总")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL)
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    parser.add_argument("--sidecar-url", default=DEFAULT_SIDECAR)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    parser.add_argument("--diff-threshold", type=float, default=DIFF_THRESHOLD)
    parser.add_argument("--jpeg-quality", type=int, default=JPEG_QUALITY)
    parser.add_argument("--once", action="store_true", help="单次采集后退出（自检）")
    parser.add_argument("--backfill", action="store_true",
                        help="前台消费所有待汇总段后退出")
    args = parser.parse_args()

    cfg = argparse.Namespace(
        interval=max(5, args.interval), data_dir=Path(args.data_dir),
        sidecar_url=args.sidecar_url.rstrip("/"), timeout=args.timeout,
        diff_threshold=args.diff_threshold, jpeg_quality=args.jpeg_quality,
    )
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    setup_logging(cfg.data_dir)
    if sys.stdout and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    if args.backfill:
        log.info("补汇总模式：data=%s sidecar=%s", cfg.data_dir, cfg.sidecar_url)
        if not sidecar_reachable(cfg.sidecar_url):
            log.error("侧车不可达，无法补汇总")
            return 1
        n = 0
        while True:
            segs = scan_pending_segments(cfg.data_dir)
            if not segs:
                break
            seg = segs[0]
            log.info("（第 %d 段）%s %s-%s", n + 1, seg["ymd"],
                     seg["start"], seg["end"])
            try:
                process_segment(cfg, seg)
                n += 1
            except Exception as e:
                log.error("段处理失败 %s %s：%s", seg["ymd"], seg["start"],
                          f"{type(e).__name__}: {e}"[:200])
                mark_segment(cfg.data_dir, seg["ymd"], {
                    "idx": seg["idx"], "start": seg["start"], "end": seg["end"],
                    "status": SEG_STATUS_FAILED,
                    "error": f"{type(e).__name__}: {e}"[:200],
                    "samples": seg["samples"], "images": []})
        log.info("补汇总完成：成功 %d 段", n)
        return 0

    enable_dpi_awareness()

    store = RecordStore(cfg.data_dir)
    state = {
        "running": True, "last_sig": None, "last_image": None,
        "cap_fails": 0, "stop_event": threading.Event(),
    }

    log.info("管家启动 interval=%ds data=%s sidecar=%s",
             cfg.interval, cfg.data_dir, cfg.sidecar_url)
    if sidecar_reachable(cfg.sidecar_url):
        log.info("视觉侧车在线")
    else:
        log.warning("视觉侧车不在线——截图照常，汇总将排队等待侧车上线")

    if args.once:
        capture_once(cfg, store, state)
        log.info("单次采集完成，退出")
        return 0

    # ---- 跨实例协调（主应用 / 独立控制台共用约定，数据目录内）----
    # engine.json：活引擎标识（pid）。任何 UI 以此文件 + PID 活性判断"是否已有引擎"，
    #              而不是各自进程内的 child 引用，避免两个 UI 重复启动引擎。
    # stop.flag：  优雅停止信号。主循环每秒检查，存在则退出（任何 UI 都能停）。
    butler_dir = cfg.data_dir / "_butler"
    butler_dir.mkdir(parents=True, exist_ok=True)
    stop_flag = butler_dir / "stop.flag"
    try:
        stop_flag.unlink()  # 清除残留停止信号
    except FileNotFoundError:
        pass
    engine_file = butler_dir / "engine.json"
    atomic_write_json(engine_file, {
        "pid": os.getpid(),
        "started_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "data_dir": str(cfg.data_dir),
    })
    log.info("引擎标识已写入 %s（pid=%d）", engine_file, os.getpid())

    cap = threading.Thread(target=capture_loop, args=(cfg, store, state),
                           name="capture", daemon=True)
    summ = threading.Thread(target=summarize_loop, args=(cfg, state),
                            name="summarize", daemon=True)
    cap.start()
    summ.start()

    try:
        while cap.is_alive():
            if stop_flag.exists():
                log.info("收到停止信号（stop.flag），正在退出…")
                try:
                    stop_flag.unlink()
                except OSError:
                    pass
                break
            time.sleep(1)
    except KeyboardInterrupt:
        log.info("收到停止信号，正在退出…")
    finally:
        state["running"] = False
        state["stop_event"].set()
        cap.join(timeout=3)
        summ.join(timeout=3)
        # 仅当 engine.json 仍属于本进程时清理（防止误删新引擎的标识）
        try:
            info = json.loads(engine_file.read_text(encoding="utf-8"))
            if info.get("pid") == os.getpid():
                engine_file.unlink()
        except (OSError, ValueError):
            pass
        log.info("管家已停止")
    return 0


if __name__ == "__main__":
    sys.exit(main())
