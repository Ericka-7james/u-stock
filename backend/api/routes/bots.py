# backend/api/routes/bots.py
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, time as dtime
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

try:
    from zoneinfo import ZoneInfo  # py3.9+
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

router = APIRouter(tags=["bots"])

_BOT_STATE: Dict[str, Dict[str, Any]] = {}  # bot_id -> {running, mode, last_run, last_error, last_intents}


def _output_dir() -> Optional[Path]:
    out_dir = os.getenv("OUTPUT_DIR") or ""
    if not out_dir:
        return None
    return Path(out_dir).expanduser().resolve()


def _read_market_gate() -> Optional[Dict[str, Any]]:
    p = _output_dir()
    if not p:
        return None
    f = p / "market_gate.json"
    if not f.exists():
        return None
    try:
        return json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return None


@dataclass
class PauseInfo:
    paused: bool
    reason: Optional[str] = None
    next_open_epoch: Optional[float] = None


def _next_weekday(dt: datetime) -> datetime:
    # next weekday (Mon-Fri)
    d = dt
    while d.weekday() >= 5:
        d = d + timedelta(days=1)
    return d


def _market_hours_pause_info() -> PauseInfo:
    """
    Simple market-hours gate: Mon-Fri 9:30–16:00 America/New_York.
    Not holiday-aware (fine for now; later we can use Alpaca clock endpoint).
    """
    if ZoneInfo is None:
        return PauseInfo(paused=False)

    tz = ZoneInfo("America/New_York")
    now = datetime.now(tz)

    # Weekend
    if now.weekday() >= 5:
        nxt = _next_weekday(now + timedelta(days=1)).replace(hour=9, minute=30, second=0, microsecond=0)
        return PauseInfo(True, "Market closed (weekend)", nxt.timestamp())

    open_t = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_t = now.replace(hour=16, minute=0, second=0, microsecond=0)

    if now < open_t:
        return PauseInfo(True, "Market closed (pre-open)", open_t.timestamp())

    if now >= close_t:
        nxt_day = _next_weekday(now + timedelta(days=1)).replace(hour=9, minute=30, second=0, microsecond=0)
        return PauseInfo(True, "Market closed (after-hours)", nxt_day.timestamp())

    return PauseInfo(False)


def _market_pause_info() -> PauseInfo:
    """
    Priority:
      1) If market_gate.json exists and is active -> paused (gate active)
      2) Else -> pause based on simple market hours (9:30–16:00 ET)
    """
    gate = _read_market_gate()
    now = time.time()

    if isinstance(gate, dict):
        until = gate.get("closed_until")
        if isinstance(until, (int, float)) and float(until) > now:
            return PauseInfo(True, "Market closed (gate active)", float(until))

    return _market_hours_pause_info()


class BotStartRequest(BaseModel):
    bot_id: str
    mode: str = "paper"


@router.get("/api/bots/available")
def available_bots() -> Dict[str, Any]:
    return {
        "bots": [
            {"id": "ema_trend", "name": "EMA Trend Bot", "description": "EMA reclaim + ATR gate + chop filter"},
        ]
    }


@router.post("/api/bots/start")
def start_bot(req: BotStartRequest) -> Dict[str, Any]:
    bot_id = (req.bot_id or "").strip()
    if not bot_id:
        raise HTTPException(status_code=400, detail="bot_id is required")

    st = _BOT_STATE.get(bot_id) or {}
    st["running"] = True
    st["mode"] = req.mode or "paper"
    st.setdefault("last_run", None)
    st.setdefault("last_error", None)
    st.setdefault("last_intents", 0)
    _BOT_STATE[bot_id] = st

    pause = _market_pause_info()
    state = "paused" if pause.paused else "running"

    return {
        "ok": True,
        "bot_id": bot_id,
        "state": state,
        "pausedReason": pause.reason,
        "nextOpenEpoch": pause.next_open_epoch,
    }


@router.post("/api/bots/stop")
def stop_bot(bot_id: str = Query(...)) -> Dict[str, Any]:
    bot_id = (bot_id or "").strip()
    st = _BOT_STATE.get(bot_id) or {}
    st["running"] = False
    _BOT_STATE[bot_id] = st
    return {"ok": True, "bot_id": bot_id, "state": "stopped"}


@router.get("/api/bots/status")
def bot_status(bot_id: str = Query(...)) -> Dict[str, Any]:
    bot_id = (bot_id or "").strip()
    st = _BOT_STATE.get(bot_id) or {"running": False, "mode": "paper", "last_run": None, "last_error": None, "last_intents": 0}

    pause = _market_pause_info()

    if st.get("running") and pause.paused:
        state = "paused"
    elif st.get("running"):
        state = "running"
    else:
        state = "stopped"

    return {
        "ok": True,
        "bot_id": bot_id,
        "state": state,
        "mode": st.get("mode", "paper"),
        "lastRun": st.get("last_run"),
        "lastIntents": st.get("last_intents", 0),
        "lastError": st.get("last_error"),
        "pausedReason": pause.reason,
        "nextOpenEpoch": pause.next_open_epoch,
    }
