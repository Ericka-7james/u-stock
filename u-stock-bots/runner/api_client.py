# u-stock-bots/runner/api_client.py
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from bots._shared.ustock_http import UStockAPI


def now_epoch() -> int:
    return int(time.time())


def _as_dict(x: Any) -> Dict[str, Any]:
    return x if isinstance(x, dict) else {}


def _as_list_of_dicts(x: Any) -> List[Dict[str, Any]]:
    if not isinstance(x, list):
        return []
    out: List[Dict[str, Any]] = []
    for it in x:
        if isinstance(it, dict):
            out.append(it)
    return out


def get_status(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    """
    Runner-authenticated status endpoint (no cookies).
    Expected:
      { ok, bot_id, intent, mode, config, user_id, ... }

    Production-grade behavior:
      - never throws on shape issues; returns dict
    """
    data = api.get("/api/bots/status_runner", params={"bot_id": str(bot_id or "").strip()})
    return _as_dict(data)


def submit_intents(api: UStockAPI, bot_id: str, intents: List[Dict[str, Any]]) -> None:
    """
    Report strategy intents back to backend for UI visibility.
    This is NOT execution.
    """
    payload = {
        "bot_id": str(bot_id or "").strip(),
        "ts": now_epoch(),
        "items": _as_list_of_dicts(intents),
    }
    api.post("/api/bots/submit-intents", json=payload)


def market_session(api: UStockAPI) -> Dict[str, Any]:
    """
    Market-hours gate helper.
    Must fail-open in local dev (so runner doesn't freeze on network issues).
    """
    try:
        data = api.get("/api/market/us/session")
        d = _as_dict(data)
        if "ok" not in d:
            d["ok"] = False
        return d
    except Exception:
        return {"ok": False}


def sync_trade_fills(api: UStockAPI, *, user_id: str, bot_id: str, mode: str) -> None:
    """
    Runner-authenticated fills sync (no cookies).
    Safe fire-and-forget (orchestrator already wraps it).
    """
    api.post(
        "/api/trade_fills/sync_runner",
        json={
            "user_id": str(user_id or "").strip(),
            "bot_id": str(bot_id or "").strip(),
            "mode": str(mode or "paper").strip().lower(),
        },
    )


def post_heartbeat(
    api: UStockAPI,
    *,
    bot_id: str,
    intent: str,
    effective_state: str,
    mode: str,
    message: Optional[str] = None,
    reason_code: Optional[str] = None,
    paused_reason: Optional[str] = None,
    next_open_epoch: Optional[int] = None,
    last_error: Optional[str] = None,
    last_tick: Optional[int] = None,
) -> None:
    """
    Heartbeat is the runner -> backend "I'm alive" signal.
    Keep this payload stable. Backend can evolve, but runner should be consistent.

    Production-grade behavior:
      - timestamps are always filled
      - strings normalized
      - never crashes caller on minor coercion issues
    """
    now = now_epoch()

    def _s(x: Any) -> Optional[str]:
        if x is None:
            return None
        s = str(x).strip()
        return s if s != "" else None

    bt = _s(bot_id) or "unknown"
    it = (_s(intent) or "paused").lower()
    st = _s(effective_state) or "unknown"
    md = (_s(mode) or "paper").lower()

    # Prefer an explicit tick passed from orchestrator, else now.
    tick = int(last_tick or now)

    payload: Dict[str, Any] = {
        "bot_id": bt,
        "intent": it,
        "effective_state": st,
        "mode": md,
        "heartbeat_at": now,
        "last_run": now,
        "last_tick": tick,
        "reason_code": _s(reason_code),
        "message": _s(message),
        "paused_reason": _s(paused_reason),
        "next_open_epoch": int(next_open_epoch) if isinstance(next_open_epoch, (int, float)) else None,
        "last_error": _s(last_error),
    }

    api.post("/api/bots/heartbeat", json=payload)
