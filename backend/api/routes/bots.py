# backend/api/routes/bots.py
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/bots", tags=["bots"])

# Runtime folder (already in your repo as ../backend/runtime/)
RUNTIME_DIR = Path(__file__).resolve().parents[2] / "runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

STATE_DIR = RUNTIME_DIR / "bots"
STATE_DIR.mkdir(parents=True, exist_ok=True)


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


def _write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _append_log(bot_id: str, level: str, message: str, meta: Optional[Dict[str, Any]] = None) -> None:
    meta = meta or {}
    row = {
        "ts": int(time.time()),
        "level": str(level).lower(),
        "message": str(message),
        "meta": meta,
    }
    log_path = _bot_dir(bot_id) / "log.jsonl"
    with log_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _default_config() -> Dict[str, Any]:
    return {
        "mode": "paper",            # paper | live (you can gate live later)
        "risk_per_trade": 0.005,    # 0.5%
        "max_trades_per_day": 3,
        "min_confidence": 0.62,
    }


@router.get("/available")
def available():
    # Keep it explicit for now; later you can auto-discover bots from registry.
    bots = [
        {"id": "ema_trend", "name": "EMA Trend Bot", "description": "EMA reclaim + ATR gate + chop filter"},
    ]
    return {"bots": bots}


@router.get("/status")
def status(bot_id: str = Query(...)):
    bid = str(bot_id).strip()
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    d = _bot_dir(bid)
    state = _read_json(d / "state.json", {})
    cfg = _read_json(d / "config.json", _default_config())
    intents = _read_json(d / "intents.json", {"items": [], "ts": 0})

    out = {
        "bot_id": bid,
        "state": state.get("state", "stopped"),         # running | paused | stopped
        "mode": state.get("mode", cfg.get("mode", "paper")),
        "lastRun": state.get("last_run", 0),
        "lastIntents": len(intents.get("items") or []),
        "lastError": state.get("last_error"),
        "pausedReason": state.get("paused_reason"),
        "nextOpenEpoch": state.get("next_open_epoch"),
        "config": cfg,
    }
    return out


@router.post("/start")
def start(payload: Dict[str, Any]):
    bid = str(payload.get("bot_id") or "").strip()
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    mode = str(payload.get("mode") or "paper")
    d = _bot_dir(bid)

    state = _read_json(d / "state.json", {})
    state.update(
        {
            "bot_id": bid,
            "state": "running",
            "mode": mode,
            "last_error": None,
            "paused_reason": None,
        }
    )
    _write_json(d / "state.json", state)
    _append_log(bid, "info", "Bot started", {"mode": mode})

    return {"ok": True, "bot_id": bid, "state": "running", "mode": mode}


@router.post("/stop")
def stop(bot_id: str = Query(...)):
    bid = str(bot_id).strip()
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    d = _bot_dir(bid)
    state = _read_json(d / "state.json", {})
    state.update({"bot_id": bid, "state": "stopped"})
    _write_json(d / "state.json", state)
    _append_log(bid, "info", "Bot stopped", {})

    return {"ok": True, "bot_id": bid, "state": "stopped"}


@router.get("/intents")
def intents(bot_id: str = Query(...), limit: int = Query(10, ge=1, le=50)):
    bid = str(bot_id).strip()
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    d = _bot_dir(bid)
    data = _read_json(d / "intents.json", {"items": [], "ts": 0})
    items = list(data.get("items") or [])[: int(limit)]
    return {"bot_id": bid, "ts": int(data.get("ts") or 0), "items": items}


@router.get("/log")
def log(bot_id: str = Query(...), limit: int = Query(50, ge=1, le=300)):
    bid = str(bot_id).strip()
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    log_path = _bot_dir(bid) / "log.jsonl"
    if not log_path.exists():
        return {"bot_id": bid, "items": []}

    # Read last N lines efficiently-ish (small scale)
    try:
        lines = log_path.read_text(encoding="utf-8").splitlines()
        tail = lines[-int(limit) :]
        items: List[Dict[str, Any]] = []
        for ln in tail:
            try:
                items.append(json.loads(ln))
            except Exception:
                continue
        return {"bot_id": bid, "items": items}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": "Failed to read log", "error": repr(e)})


@router.get("/config")
def get_config(bot_id: str = Query(...)):
    bid = str(bot_id).strip()
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})
    d = _bot_dir(bid)
    cfg = _read_json(d / "config.json", _default_config())
    return {"bot_id": bid, "config": cfg}


@router.post("/config")
def set_config(payload: Dict[str, Any]):
    bid = str(payload.get("bot_id") or "").strip()
    config = payload.get("config")
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})
    if not isinstance(config, dict):
        return JSONResponse(status_code=400, content={"detail": "config must be an object"})

    d = _bot_dir(bid)
    existing = _read_json(d / "config.json", _default_config())
    existing.update(config)

    # minimal guards
    if existing.get("mode") not in ("paper", "live"):
        existing["mode"] = "paper"

    _write_json(d / "config.json", existing)
    _append_log(bid, "info", "Config updated", {"config": existing})
    return {"ok": True, "bot_id": bid, "config": existing}
