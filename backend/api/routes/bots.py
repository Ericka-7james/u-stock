# backend/api/routes/bots.py
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/bots", tags=["bots"])

# -----------------------------
# Storage (local runtime)
# -----------------------------

# repo structure: backend/api/routes/bots.py -> parents[2] == backend/
BACKEND_DIR = Path(__file__).resolve().parents[2]
RUNTIME_DIR = BACKEND_DIR / "runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

STATE_DIR = RUNTIME_DIR / "bots"
STATE_DIR.mkdir(parents=True, exist_ok=True)

# -----------------------------
# "Production-ish" knobs
# (tune later or env override)
# -----------------------------
BOT_ID_RE = re.compile(r"^[a-zA-Z0-9_]{1,64}$")  # safe folder name
MAX_LOG_LINES = int(os.getenv("USTOCK_BOT_LOG_MAX_LINES", "2000"))  # per bot log.jsonl
MAX_LOG_BYTES = int(os.getenv("USTOCK_BOT_LOG_MAX_BYTES", "2000000"))  # ~2MB safety
MAX_INTENTS_STORED = int(os.getenv("USTOCK_BOT_INTENTS_MAX_ITEMS", "200"))
MAX_INTENTS_RETURN = 50  # GET /intents limit max (API-level)
MAX_ERROR_LEN = 800
WRITE_JSON_INDENT = None  # keep compact in runtime files

# -----------------------------
# Helpers
# -----------------------------


def _now_epoch() -> int:
    return int(time.time())


def _clean_bot_id(bot_id: Any) -> str:
    bid = str(bot_id or "").strip()
    if not bid:
        return ""
    if not BOT_ID_RE.match(bid):
        return ""
    return bid


def _bot_dir(bot_id: str) -> Path:
    p = STATE_DIR / bot_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def _read_json(path: Path, default: Any) -> Any:
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _atomic_write_text(path: Path, text: str) -> None:
    """
    Atomic-ish write: write to temp then replace.
    Prevents partial/corrupted json if process dies mid-write.
    """
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _write_json(path: Path, payload: Any) -> None:
    txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), indent=WRITE_JSON_INDENT)
    _atomic_write_text(path, txt)


def _trim_log_file(log_path: Path) -> None:
    """
    Keep log file from growing forever:
    - if > MAX_LOG_BYTES, keep tail lines
    - always cap to MAX_LOG_LINES
    """
    if not log_path.exists():
        return

    try:
        # Fast path: if small enough, only enforce line cap
        size = log_path.stat().st_size
        lines = log_path.read_text(encoding="utf-8").splitlines()

        if len(lines) > MAX_LOG_LINES:
            lines = lines[-MAX_LOG_LINES :]

        # If file is too big, also reduce lines more aggressively
        if size > MAX_LOG_BYTES and len(lines) > 300:
            lines = lines[-min(MAX_LOG_LINES, 800) :]

        _atomic_write_text(log_path, "\n".join(lines) + ("\n" if lines else ""))
    except Exception:
        # never break request path due to trimming
        return


def _append_log(bot_id: str, level: str, message: str, meta: Optional[Dict[str, Any]] = None) -> None:
    meta = meta or {}
    row = {"ts": _now_epoch(), "level": str(level).lower(), "message": str(message), "meta": meta}

    log_path = _bot_dir(bot_id) / "log.jsonl"
    try:
        with log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    finally:
        _trim_log_file(log_path)


def _default_config() -> Dict[str, Any]:
    return {
        "mode": "paper",  # paper | live
        "risk_per_trade": 0.005,  # 0.5%
        "max_trades_per_day": 3,
        "min_confidence": 0.62,
    }


def _normalize_mode(x: Any) -> str:
    m = str(x or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _normalize_state(x: Any, default: str = "running") -> str:
    s = str(x or "").strip().lower()
    return s if s in ("running", "paused", "stopped") else default


def _safe_int(x: Any, default: int = 0) -> int:
    try:
        v = int(x)
        return v
    except Exception:
        return default


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
        return v
    except Exception:
        return default


def _normalize_next_open_epoch(x: Any) -> Optional[int]:
    if isinstance(x, (int, float)) and x > 0:
        return int(x)
    try:
        v = int(x)
        return v if v > 0 else None
    except Exception:
        return None


def _normalize_paused_reason(x: Any) -> Optional[str]:
    if x is None:
        return None
    s = str(x).strip()
    return s or None


def _normalize_error(x: Any) -> Optional[str]:
    if not x:
        return None
    s = str(x)
    return s[:MAX_ERROR_LEN]


# -----------------------------
# API
# -----------------------------


@router.get("/available")
def available():
    # Later: load from registry/config; for now keep static list
    bots = [
        {"id": "ema_trend", "name": "EMA Trend Bot", "description": "EMA reclaim + ATR gate + chop filter"},
    ]
    return {"bots": bots}


@router.get("/status")
def status(bot_id: str = Query(...)):
    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    d = _bot_dir(bid)
    state = _read_json(d / "state.json", {})
    cfg = _read_json(d / "config.json", _default_config())
    intents_doc = _read_json(d / "intents.json", {"items": [], "ts": 0})

    items = intents_doc.get("items") or []
    if not isinstance(items, list):
        items = []

    out = {
        "bot_id": bid,
        "state": str(state.get("state", "stopped")),  # running | paused | stopped
        "mode": str(state.get("mode", cfg.get("mode", "paper"))),
        "lastRun": int(state.get("last_run") or 0),
        "lastIntents": len(items),
        "lastError": state.get("last_error"),
        "pausedReason": state.get("paused_reason"),
        "nextOpenEpoch": state.get("next_open_epoch"),
        "config": cfg,
    }
    return out


@router.post("/start")
def start(payload: Dict[str, Any]):
    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    mode = _normalize_mode(payload.get("mode"))

    d = _bot_dir(bid)
    state = _read_json(d / "state.json", {})

    state.update(
        {
            "bot_id": bid,
            "state": "running",
            "mode": mode,
            "last_run": int(state.get("last_run") or 0),
            "last_error": None,
            "paused_reason": None,
            "next_open_epoch": None,
        }
    )
    _write_json(d / "state.json", state)
    _append_log(bid, "info", "Bot started", {"mode": mode})

    return {"ok": True, "bot_id": bid, "state": "running", "mode": mode}


@router.post("/stop")
def stop(bot_id: str = Query(...)):
    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    d = _bot_dir(bid)
    state = _read_json(d / "state.json", {})
    prev_state = state.get("state")

    state.update(
        {
            "bot_id": bid,
            "state": "stopped",
            "paused_reason": None,
            "next_open_epoch": None,
        }
    )
    _write_json(d / "state.json", state)

    if prev_state != "stopped":
        _append_log(bid, "info", "Bot stopped", {})

    return {"ok": True, "bot_id": bid, "state": "stopped"}


@router.post("/heartbeat")
def heartbeat(payload: Dict[str, Any]):
    """
    Runner calls this each loop so UI can show:
      - pausedReason / nextOpenEpoch
      - lastRun
      - lastError

    IMPORTANT:
    - Do NOT spam logs every loop.
    - Only log on state transitions or errors.
    """
    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    state_in = _normalize_state(payload.get("state"), default="running")
    mode = _normalize_mode(payload.get("mode"))
    last_run = _safe_int(payload.get("last_run"), default=_now_epoch())

    paused_reason = _normalize_paused_reason(payload.get("paused_reason"))
    next_open_epoch = _normalize_next_open_epoch(payload.get("next_open_epoch"))
    last_error = _normalize_error(payload.get("last_error"))

    d = _bot_dir(bid)
    state = _read_json(d / "state.json", {})
    prev_state = state.get("state")
    prev_error = state.get("last_error")

    state.update(
        {
            "bot_id": bid,
            "state": state_in,
            "mode": mode,
            "last_run": last_run,
            "paused_reason": paused_reason,
            "next_open_epoch": next_open_epoch,
            "last_error": last_error,
        }
    )
    _write_json(d / "state.json", state)

    # Log only when interesting
    if last_error and last_error != prev_error:
        _append_log(bid, "error", "Runner error", {"error": last_error})
    elif prev_state != state_in:
        _append_log(bid, "info", "State changed", {"from": prev_state, "to": state_in, "reason": paused_reason})

    return {"ok": True, "bot_id": bid, "state": state_in, "ts": _now_epoch()}


@router.post("/submit-intents")
def submit_intents(payload: Dict[str, Any]):
    """
    Runner submits latest intents list for UI to read via GET /api/bots/intents

    Stored in runtime/bots/<bot_id>/intents.json
    """
    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    ts = _safe_int(payload.get("ts"), default=_now_epoch())
    items = payload.get("items")

    if not isinstance(items, list):
        return JSONResponse(status_code=400, content={"detail": "items must be a list"})

    # Cap stored size
    items = items[:MAX_INTENTS_STORED]

    d = _bot_dir(bid)
    _write_json(d / "intents.json", {"ts": ts, "items": items})

    # This can be noisy; keep as debug-ish info but still useful for you right now.
    _append_log(bid, "info", "Intents submitted", {"count": len(items), "ts": ts})
    return {"ok": True, "bot_id": bid, "count": len(items), "ts": ts}


@router.get("/intents")
def intents(bot_id: str = Query(...), limit: int = Query(10, ge=1, le=MAX_INTENTS_RETURN)):
    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    d = _bot_dir(bid)
    data = _read_json(d / "intents.json", {"items": [], "ts": 0})
    items = data.get("items") or []
    if not isinstance(items, list):
        items = []

    return {"bot_id": bid, "ts": int(data.get("ts") or 0), "items": list(items)[: int(limit)]}


@router.get("/log")
def log(bot_id: str = Query(...), limit: int = Query(50, ge=1, le=300)):
    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    log_path = _bot_dir(bid) / "log.jsonl"
    if not log_path.exists():
        return {"bot_id": bid, "items": []}

    try:
        lines = log_path.read_text(encoding="utf-8").splitlines()
        tail = lines[-int(limit) :]
        out: List[Dict[str, Any]] = []
        for ln in tail:
            try:
                out.append(json.loads(ln))
            except Exception:
                continue
        return {"bot_id": bid, "items": out}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": "Failed to read log", "error": repr(e)})


@router.get("/config")
def get_config(bot_id: str = Query(...)):
    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    d = _bot_dir(bid)
    cfg = _read_json(d / "config.json", _default_config())
    return {"bot_id": bid, "config": cfg}


@router.post("/config")
def set_config(payload: Dict[str, Any]):
    bid = _clean_bot_id(payload.get("bot_id"))
    config = payload.get("config")

    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})
    if not isinstance(config, dict):
        return JSONResponse(status_code=400, content={"detail": "config must be an object"})

    d = _bot_dir(bid)
    existing = _read_json(d / "config.json", _default_config())

    # Merge with basic normalization
    merged = dict(existing)
    merged.update(config)

    merged["mode"] = _normalize_mode(merged.get("mode"))
    merged["risk_per_trade"] = float(_safe_float(merged.get("risk_per_trade"), default=0.005))
    merged["max_trades_per_day"] = max(1, int(_safe_int(merged.get("max_trades_per_day"), default=3)))
    merged["min_confidence"] = float(min(0.99, max(0.0, _safe_float(merged.get("min_confidence"), default=0.62))))

    _write_json(d / "config.json", merged)
    _append_log(bid, "info", "Config updated", {"config": merged})

    return {"ok": True, "bot_id": bid, "config": merged}
