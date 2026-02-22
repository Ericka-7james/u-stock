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


def _env_int(name: str, default: int, *, min_value: int = 1) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw == "":
        return max(int(min_value), int(default))
    try:
        v = int(raw)
    except Exception:
        v = int(default)
    return max(int(min_value), int(v))


def _env_bool(name: str, default: bool = False) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if raw == "":
        return bool(default)
    return raw in ("1", "true", "t", "yes", "y", "on")


def _heartbeat_every_seconds() -> int:
    # Clamp to avoid accidental spam
    return _env_int("RUNNER_HEARTBEAT_EVERY_SECONDS", 60, min_value=5)


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
      - otherwise at most every RUNNER_HEARTBEAT_EVERY_SECONDS
    """
    if signature != state.last_signature:
        state.last_signature = signature
        state.last_hb_ts = now
        return True

    every = _heartbeat_every_seconds()
    if now - int(state.last_hb_ts) >= int(every):
        state.last_hb_ts = now
        return True

    return False


def safe_heartbeat(api: UStockAPI, **kwargs: Any) -> None:
    """
    Never let heartbeat break the runner loop.

    IMPORTANT:
      Backend requires user_id. If user_id is missing/empty, skip heartbeat
      to avoid 400 spam.
    """
    debug = _env_bool("RUNNER_DEBUG", False)

    uid = str(kwargs.get("user_id") or "").strip()
    if not uid:
        return

    try:
        api_client.post_heartbeat(api, **kwargs)
    except Exception as e:
        if debug:
            print("[runner] heartbeat failed:", repr(e))


def send_stopped(
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
    sig = f"stopped|{status_mode}|intent_stopped"
    if should_heartbeat(state, sig, now=now):
        safe_heartbeat(
            api,
            user_id=uid,
            bot_id=bot_id,
            intent="stopped",
            effective_state="stopped",
            mode=status_mode,
            reason_code="intent_stopped",
            message="Stopped by user.",
            last_error=None,
            last_tick=now,
        )


class MarketClosed(Exception):
    """
    Raised to short-circuit the orchestrator loop when market is closed.
    Includes optional metadata for debugging/logging.
    """
    def __init__(self, *, next_open_epoch: Optional[int] = None, reason: str = "Market closed") -> None:
        super().__init__(reason)
        self.next_open_epoch = next_open_epoch
        self.reason = reason


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
    debug = _env_bool("RUNNER_DEBUG", False)

    sess = api_client.market_session(api, bot_id)

    # Fail-open if endpoint fails or shape unexpected
    if not bool(sess.get("ok")):
        if debug:
            print("[runner] market_session not ok; fail-open", sess)
        return

    is_open = bool(sess.get("is_open"))
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

    raise MarketClosed(next_open_epoch=next_open_epoch, reason=paused_reason)