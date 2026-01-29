# u-stock-bots/runner/api_client.py
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from bots._shared.ustock_http import UStockAPI


def now_epoch() -> int:
    return int(time.time())


def get_status(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    # runner-authenticated endpoint (no cookies)
    return api.get("/api/bots/status_runner", params={"bot_id": bot_id})


def submit_intents(api: UStockAPI, bot_id: str, intents: List[Dict[str, Any]]) -> None:
    api.post("/api/bots/submit-intents", json={"bot_id": bot_id, "ts": now_epoch(), "items": intents})


def market_session(api: UStockAPI) -> Dict[str, Any]:
    try:
        data = api.get("/api/market/us/session")
        return data if isinstance(data, dict) else {"ok": False}
    except Exception:
        return {"ok": False}


def sync_trade_fills(api: UStockAPI, *, user_id: str, bot_id: str, mode: str) -> None:
    # runner-authenticated endpoint (no cookies)
    api.post("/api/trade_fills/sync_runner", json={"user_id": user_id, "bot_id": bot_id, "mode": mode})


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
    now = now_epoch()
    api.post(
        "/api/bots/heartbeat",
        json={
            "bot_id": bot_id,
            "intent": intent,
            "effective_state": effective_state,
            "mode": mode,
            "heartbeat_at": now,
            "last_run": now,
            "last_tick": int(last_tick or now),
            "reason_code": reason_code,
            "message": message,
            "paused_reason": paused_reason,
            "next_open_epoch": next_open_epoch,
            "last_error": last_error,
        },
    )
