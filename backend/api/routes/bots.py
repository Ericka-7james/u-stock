# backend/api/routes/bots.py
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
# -----------------------------
BOT_ID_RE = re.compile(r"^[a-zA-Z0-9_]{1,64}$")
MAX_LOG_LINES = int(os.getenv("USTOCK_BOT_LOG_MAX_LINES", "2000"))
MAX_LOG_BYTES = int(os.getenv("USTOCK_BOT_LOG_MAX_BYTES", "2000000"))
MAX_INTENTS_STORED = int(os.getenv("USTOCK_BOT_INTENTS_MAX_ITEMS", "200"))
MAX_INTENTS_RETURN = 50
MAX_ERROR_LEN = 800
WRITE_JSON_INDENT = None

# Heartbeat / offline detection
HEARTBEAT_STALE_SECONDS = int(os.getenv("USTOCK_BOT_HEARTBEAT_STALE_SECONDS", "25"))

# Canonical states (effective)
EFFECTIVE_STATES = {
    "starting",
    "running",
    "waiting_for_market",
    "paused",
    "stopped",
    "degraded",
    "error",
    "offline",
}

# Canonical intents (desired)
INTENTS = {"running", "paused"}

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
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def _write_json(path: Path, payload: Any) -> None:
    txt = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), indent=WRITE_JSON_INDENT)
    _atomic_write_text(path, txt)


def _trim_log_file(log_path: Path) -> None:
    if not log_path.exists():
        return
    try:
        size = log_path.stat().st_size
        lines = log_path.read_text(encoding="utf-8").splitlines()

        if len(lines) > MAX_LOG_LINES:
            lines = lines[-MAX_LOG_LINES:]

        if size > MAX_LOG_BYTES and len(lines) > 300:
            lines = lines[-min(MAX_LOG_LINES, 800):]

        _atomic_write_text(log_path, "\n".join(lines) + ("\n" if lines else ""))
    except Exception:
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
        "risk_per_trade": 0.005,
        "max_trades_per_day": 3,
        "min_confidence": 0.62,
    }


def _normalize_mode(x: Any) -> str:
    m = str(x or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _safe_int(x: Any, default: int = 0) -> int:
    try:
        return int(x)
    except Exception:
        return default


def _safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
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


def _normalize_intent(x: Any, default: str = "paused") -> str:
    v = str(x or "").strip().lower()
    return v if v in INTENTS else default


def _normalize_effective_state(x: Any, default: str = "stopped") -> str:
    v = str(x or "").strip().lower()
    return v if v in EFFECTIVE_STATES else default


def _compute_offline(intent: str, heartbeat_at: int, updated_at: int) -> Tuple[bool, Optional[int]]:
    now = _now_epoch()

    # If user wants it running but we have never received a heartbeat -> offline
    if intent == "running" and not heartbeat_at:
        age = now - int(updated_at or now)
        return (age > HEARTBEAT_STALE_SECONDS, age)

    if not heartbeat_at:
        return (False, None)

    age = now - int(heartbeat_at)
    return (age > HEARTBEAT_STALE_SECONDS, age)


def _state_doc_defaults(bot_id: str) -> Dict[str, Any]:
    return {
        "bot_id": bot_id,
        # Intent: what user wants
        "intent": "paused",
        # Effective: what runner/bot is doing
        "effective_state": "stopped",
        "reason_code": None,
        "message": None,
        "mode": "paper",
        "last_run": 0,
        "last_tick": 0,
        "heartbeat_at": 0,
        "paused_reason": None,
        "next_open_epoch": None,
        "last_error": None,
        "updated_at": 0,
    }


def _read_state(bot_id: str) -> Dict[str, Any]:
    d = _bot_dir(bot_id)
    raw = _read_json(d / "state.json", {})
    base = _state_doc_defaults(bot_id)
    if isinstance(raw, dict):
        base.update(raw)
    # normalize key fields
    base["intent"] = _normalize_intent(base.get("intent"), default="paused")
    base["effective_state"] = _normalize_effective_state(base.get("effective_state"), default="stopped")
    base["mode"] = _normalize_mode(base.get("mode"))
    base["last_run"] = _safe_int(base.get("last_run"), 0)
    base["last_tick"] = _safe_int(base.get("last_tick"), 0)
    base["heartbeat_at"] = _safe_int(base.get("heartbeat_at"), 0)
    base["updated_at"] = _safe_int(base.get("updated_at"), 0)
    base["paused_reason"] = _normalize_paused_reason(base.get("paused_reason"))
    base["next_open_epoch"] = _normalize_next_open_epoch(base.get("next_open_epoch"))
    base["last_error"] = _normalize_error(base.get("last_error"))
    base["reason_code"] = (str(base.get("reason_code")).strip() if base.get("reason_code") else None)
    base["message"] = (str(base.get("message")).strip() if base.get("message") else None)
    return base


def _write_state(bot_id: str, state: Dict[str, Any]) -> None:
    d = _bot_dir(bot_id)
    _write_json(d / "state.json", state)


def _status_view(bot_id: str) -> Dict[str, Any]:
    """
    API-friendly status shape consumed by UI.
    Adds derived OFFLINE detection.
    """
    d = _bot_dir(bot_id)
    state = _read_state(bot_id)
    cfg = _read_json(d / "config.json", _default_config())
    intents_doc = _read_json(d / "intents.json", {"items": [], "ts": 0})

    items = intents_doc.get("items") or []
    if not isinstance(items, list):
        items = []

    effective = str(state.get("effective_state") or "stopped").lower()
    heartbeat_at = int(state.get("heartbeat_at") or 0)

    intent = str(state.get("intent") or "paused").lower()
    updated_at = int(state.get("updated_at") or 0)

    is_offline, age = _compute_offline(intent, heartbeat_at, updated_at)

    if is_offline:
        effective = "offline"

    return {
        "bot_id": bot_id,
        # Desired vs actual
        "intent": str(state.get("intent") or "paused"),  # running | paused
        "effective_state": effective,  # running | waiting_for_market | paused | offline | ...
        "reason_code": state.get("reason_code"),
        "message": state.get("message"),
        # Helpful timestamps
        "heartbeatAt": heartbeat_at,
        "heartbeatAgeSec": age,
        "lastRun": int(state.get("last_run") or 0),
        "lastTick": int(state.get("last_tick") or 0),
        # Trading context
        "mode": str(state.get("mode") or cfg.get("mode") or "paper"),
        "nextOpenEpoch": state.get("next_open_epoch"),
        "pausedReason": state.get("paused_reason"),
        "lastError": state.get("last_error"),
        "lastIntents": len(items),
        "config": cfg,
    }


# -----------------------------
# API
# -----------------------------


@router.get("/available")
def available():
    bots = [
        {"id": "ema_trend", "name": "EMA Trend Bot", "description": "EMA reclaim + ATR gate + chop filter"},
    ]
    return {"bots": bots}


@router.get("/status")
def status(bot_id: str = Query(...)):
    bid = _clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})
    return _status_view(bid)


@router.get("/statuses")
def statuses():
    """
    Returns all known bot statuses.

    UI-friendly:
      { statuses: { "<bot_id>": { ...status }, ... } }
    """
    out: Dict[str, Any] = {}
    try:
        for d in STATE_DIR.iterdir():
            if d.is_dir():
                bid = _clean_bot_id(d.name)
                if not bid:
                    continue
                out[bid] = _status_view(bid)
    except Exception:
        pass
    return {"statuses": out}


@router.post("/start")
def start(payload: Dict[str, Any]):
    """
    Start => intent=running.
    (Runner may still report waiting_for_market, etc.)
    """
    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    mode = _normalize_mode(payload.get("mode"))

    state = _read_state(bid)
    prev_effective = state.get("effective_state")

    state.update(
        {
            "bot_id": bid,
            "intent": "running",
            "effective_state": "starting",
            "reason_code": "manual_start",
            "message": "Starting…",
            "mode": mode,
            "last_error": None,
            "paused_reason": None,
            "next_open_epoch": None,
            "updated_at": _now_epoch(),
        }
    )
    _write_state(bid, state)

    _append_log(bid, "info", "Intent set: running", {"mode": mode, "prev_effective_state": prev_effective})
    return {"ok": True, "bot_id": bid, "intent": "running", "effective_state": "starting", "mode": mode}

@router.post("/stop")
def stop(payload: Optional[Dict[str, Any]] = None, bot_id: Optional[str] = Query(None)):
    raw = bot_id or (payload or {}).get("bot_id")
    bid = _clean_bot_id(raw)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    paused_reason = _normalize_paused_reason((payload or {}).get("paused_reason")) or "manual_pause"

    state = _read_state(bid)
    prev_intent = state.get("intent")
    prev_eff = state.get("effective_state")

    state.update(
        {
            "bot_id": bid,
            "intent": "paused",
            "effective_state": "paused",
            "reason_code": "manual_pause",
            "message": "Paused.",
            "paused_reason": paused_reason,
            "next_open_epoch": None,
            "last_error": None,
            "updated_at": _now_epoch(),
        }
    )
    _write_state(bid, state)

    if prev_intent != "paused" or prev_eff != "paused":
        _append_log(bid, "info", "Intent set: paused", {"prev_intent": prev_intent, "prev_effective_state": prev_eff})

    return {"ok": True, "bot_id": bid, "intent": "paused", "effective_state": "paused"}

@router.post("/heartbeat")
def heartbeat(payload: Dict[str, Any]):
    """
    Runner calls this each loop.

    IMPORTANT:
    - store both intent + effective_state
    - do NOT spam logs every loop
    - log only on state transitions or new errors
    """
    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    intent_in = _normalize_intent(payload.get("intent"), default="running")
    eff_in = _normalize_effective_state(payload.get("effective_state"), default="running")

    mode = _normalize_mode(payload.get("mode"))
    heartbeat_at = _safe_int(payload.get("heartbeat_at"), default=_now_epoch())
    last_run = _safe_int(payload.get("last_run"), default=_now_epoch())
    last_tick = _safe_int(payload.get("last_tick"), default=0)

    paused_reason = _normalize_paused_reason(payload.get("paused_reason"))
    next_open_epoch = _normalize_next_open_epoch(payload.get("next_open_epoch"))
    last_error = _normalize_error(payload.get("last_error"))

    reason_code = payload.get("reason_code")
    reason_code = str(reason_code).strip() if reason_code else None

    message = payload.get("message")
    message = str(message).strip() if message else None

    state = _read_state(bid)
    prev_eff = state.get("effective_state")
    prev_intent = state.get("intent")
    prev_error = state.get("last_error")

    state.update(
        {
            "bot_id": bid,
            "intent": intent_in,
            "effective_state": eff_in,
            "reason_code": reason_code,
            "message": message,
            "mode": mode,
            "heartbeat_at": heartbeat_at,
            "last_run": last_run,
            "last_tick": last_tick,
            "paused_reason": paused_reason,
            "next_open_epoch": next_open_epoch,
            "last_error": last_error,
            "updated_at": _now_epoch(),
        }
    )
    _write_state(bid, state)

    # Log only when interesting
    if last_error and last_error != prev_error:
        _append_log(bid, "error", "Runner error", {"error": last_error})
    elif (prev_eff != eff_in) or (prev_intent != intent_in):
        _append_log(
            bid,
            "info",
            "State changed",
            {
                "from_effective": prev_eff,
                "to_effective": eff_in,
                "from_intent": prev_intent,
                "to_intent": intent_in,
                "reason": paused_reason,
                "reason_code": reason_code,
            },
        )

    return {"ok": True, "bot_id": bid, "intent": intent_in, "effective_state": eff_in, "ts": _now_epoch()}


@router.post("/submit-intents")
def submit_intents(payload: Dict[str, Any]):
    bid = _clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    ts = _safe_int(payload.get("ts"), default=_now_epoch())
    items = payload.get("items")

    if not isinstance(items, list):
        return JSONResponse(status_code=400, content={"detail": "items must be a list"})

    items = items[:MAX_INTENTS_STORED]

    d = _bot_dir(bid)
    _write_json(d / "intents.json", {"ts": ts, "items": items})

    # Keep for now (useful while building), but you can downgrade later
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
        tail = lines[-int(limit):]
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

    merged = dict(existing)
    merged.update(config)

    merged["mode"] = _normalize_mode(merged.get("mode"))
    merged["risk_per_trade"] = float(_safe_float(merged.get("risk_per_trade"), default=0.005))
    merged["max_trades_per_day"] = max(1, int(_safe_int(merged.get("max_trades_per_day"), default=3)))
    merged["min_confidence"] = float(min(0.99, max(0.0, _safe_float(merged.get("min_confidence"), default=0.62))))

    _write_json(d / "config.json", merged)
    _append_log(bid, "info", "Config updated", {"config": merged})

    return {"ok": True, "bot_id": bid, "config": merged}
