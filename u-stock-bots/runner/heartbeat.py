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
    # Generic cadence used by active loop heartbeats elsewhere.
    return _env_int("RUNNER_HEARTBEAT_EVERY_SECONDS", 60, min_value=5)


def _market_closed_heartbeat_every_seconds() -> int:
    # Off-hours cadence. Default 30 minutes.
    return _env_int("RUNNER_MARKET_CLOSED_HEARTBEAT_SECONDS", 1800, min_value=60)


def _stopped_heartbeat_every_seconds() -> int:
    # Explicit stopped refresh cadence. Default 1 hour.
    return _env_int("RUNNER_STOPPED_HEARTBEAT_SECONDS", 3600, min_value=60)


@dataclass
class HeartbeatState:
    """
    Shared anti-spam state for runner heartbeat emissions.
    """
    last_hb_ts: int = 0
    last_signature: str = ""


def should_heartbeat(
    state: HeartbeatState,
    signature: str,
    *,
    now: int,
    every_seconds: Optional[int] = None,
) -> bool:
    """
    Anti-spam policy:
      - send immediately if signature changes
      - otherwise send at most every cadence seconds
    """
    if signature != state.last_signature:
        state.last_signature = signature
        state.last_hb_ts = now
        return True

    every = int(every_seconds or _heartbeat_every_seconds())
    if now - int(state.last_hb_ts) >= every:
        state.last_hb_ts = now
        return True

    return False


def safe_heartbeat(api: UStockAPI, **kwargs: Any) -> None:
    """
    Never let heartbeat failures break the runner loop.
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
    """
    Emit a low-frequency stopped heartbeat so UI freshness does not drift forever.
    """
    uid = (str(user_id).strip() if user_id else "")
    if not uid:
        return

    now = now_epoch()
    sig = f"stopped|{status_mode}|intent_stopped"

    if should_heartbeat(
        state,
        sig,
        now=now,
        every_seconds=_stopped_heartbeat_every_seconds(),
    ):
        safe_heartbeat(
            api,
            user_id=uid,
            bot_id=bot_id,
            intent="stopped",
            effective_state="stopped",
            mode=status_mode,
            reason_code="intent_stopped",
            message="Stopped by user.",
            paused_reason="",
            next_open_epoch=0,
            last_error="",
            last_tick=now,
        )


class MarketClosed(Exception):
    """
    Raised to short-circuit the orchestrator loop when market is closed.
    Includes optional metadata for logging/debugging.
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
    Raises MarketClosed if market is closed and emits a throttled
    waiting_for_market heartbeat.

    Fail-open if the session endpoint fails, which keeps local dev resilient.
    """
    debug = _env_bool("RUNNER_DEBUG", False)

    sess = api_client.market_session(api, bot_id)

    # Fail-open if endpoint fails or returns unexpected shape.
    if not bool(sess.get("ok")):
        if debug:
            print("[runner] market_session not ok; fail-open", sess)
        return

    if bool(sess.get("is_open")):
        return

    paused_reason = str(sess.get("reason") or "Market closed").strip() or "Market closed"
    next_open = sess.get("next_open")
    next_open_epoch: Optional[int] = int(next_open) if isinstance(next_open, (int, float)) else None

    uid = (str(user_id).strip() if user_id else "")
    now = now_epoch()
    sig = f"wait_market|{mode}|market_closed|{next_open_epoch}"

    if uid and should_heartbeat(
        state,
        sig,
        now=now,
        every_seconds=_market_closed_heartbeat_every_seconds(),
    ):
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
            last_error="",
            last_tick=now,
        )

    raise MarketClosed(next_open_epoch=next_open_epoch, reason=paused_reason)