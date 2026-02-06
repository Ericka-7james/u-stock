# u-stock-bots/runner/heartbeat.py
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Optional

from bots._shared.ustock_http import UStockAPI
from runner import api_client


def now_epoch() -> int:
    return int(time.time())


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw == "":
        return int(default)
    try:
        return int(raw)
    except Exception:
        return int(default)


HEARTBEAT_EVERY_SECONDS = _env_int("RUNNER_HEARTBEAT_EVERY_SECONDS", 60)


@dataclass
class HeartbeatState:
    """
    Keeps anti-spam state out of orchestrator.py.
    """
    last_hb_ts: int = 0
    last_signature: str = ""


def should_heartbeat(state: HeartbeatState, signature: str, *, now: int) -> bool:
    """
    Anti-spam policy:
      - send immediately if signature changes
      - otherwise at most every HEARTBEAT_EVERY_SECONDS
    """
    if signature != state.last_signature:
        state.last_signature = signature
        state.last_hb_ts = now
        return True

    if now - int(state.last_hb_ts) >= int(HEARTBEAT_EVERY_SECONDS):
        state.last_hb_ts = now
        return True

    return False


def safe_heartbeat(api: UStockAPI, **kwargs: Any) -> None:
    """
    Never let heartbeat break the runner loop.

    IMPORTANT:
      Your backend requires user_id. If user_id is missing/empty, skip heartbeat
      to avoid 400 spam.
    """
    debug = (os.getenv("RUNNER_DEBUG") or "").strip().lower() in ("1", "true", "yes", "y", "on")

    uid = str(kwargs.get("user_id") or "").strip()
    if not uid:
        # Backend enforces user_id; avoid noisy 400s.
        return

    try:
        api_client.post_heartbeat(api, **kwargs)
    except Exception as e:
        if debug:
            print("[runner] heartbeat failed:", repr(e))
        return


def send_paused(
    api: UStockAPI,
    state: HeartbeatState,
    *,
    bot_id: str,
    status_mode: str,
    user_id: Optional[str] = None,
) -> None:
    uid = (str(user_id).strip() if user_id else "")
    if not uid:
        return

    now = now_epoch()
    sig = f"paused|{status_mode}|intent_paused"
    if should_heartbeat(state, sig, now=now):
        safe_heartbeat(
            api,
            user_id=uid,
            bot_id=bot_id,
            intent="paused",
            effective_state="paused",
            mode=status_mode,
            reason_code="intent_paused",
            message="Paused by user.",
            last_error=None,
            last_tick=now,
        )


class MarketClosed(Exception):
    pass


def gate_market_hours(
    api: UStockAPI,
    state: HeartbeatState,
    *,
    bot_id: str,
    mode: str,
    user_id: Optional[str] = None,
) -> None:
    """
    Raises MarketClosed if market is closed (and emits a heartbeat).
    Fail-open if endpoint fails (local dev friendly).
    """
    sess = api_client.market_session(api, bot_id)  # ✅ requires bot_id
    is_open = bool(sess.get("is_open")) if sess.get("ok") else True
    if is_open:
        return

    paused_reason = str(sess.get("reason") or "Market closed")
    next_open = sess.get("next_open")
    next_open_epoch: Optional[int] = int(next_open) if isinstance(next_open, (int, float)) else None

    uid = (str(user_id).strip() if user_id else "")

    now = now_epoch()
    sig = f"wait_market|{mode}|market_closed|{next_open_epoch}"
    if uid and should_heartbeat(state, sig, now=now):
        safe_heartbeat(
            api,
            user_id=uid,
            bot_id=bot_id,
            intent="running",
            effective_state="waiting_for_market",
            mode=mode,
            reason_code="market_closed",
            message="Waiting for market open.",
            paused_reason=paused_reason,
            next_open_epoch=next_open_epoch,
            last_error=None,
            last_tick=now,
        )

    raise MarketClosed()
