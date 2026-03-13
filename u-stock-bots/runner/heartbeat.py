# u-stock-bots/runner/heartbeat.py
from __future__ import annotations

"""Heartbeat and market-hours helpers for runner loops.

This module centralizes runner heartbeat cadence, anti-spam behavior, and
market-hours gating used by bot orchestration loops.

Responsibilities:
    - throttle heartbeat emission
    - emit low-frequency offline heartbeats
    - emit market-closed heartbeats during off-hours
    - protect the runner loop from heartbeat transport failures
    - raise a structured market-closed signal when trading should pause

Design notes:
    - heartbeat failures never crash the runner loop
    - market session lookup is fail-open for local resilience
    - stateful anti-spam behavior is managed through HeartbeatState
"""

import os
import time
from dataclasses import dataclass
from typing import Any, Optional

from bots._shared.ustock_http import UStockAPI
from runner import api_client


def now_epoch() -> int:
    """Returns the current epoch time in seconds."""
    return int(time.time())


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value."""
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int, *, min_value: int = 1) -> int:
    """Returns an integer environment variable with lower-bound enforcement."""
    raw = _env(name, "")
    if raw == "":
        return max(int(min_value), int(default))

    try:
        value = int(raw)
    except Exception:
        value = int(default)

    return max(int(min_value), int(value))


def _env_bool(name: str, default: bool = False) -> bool:
    """Returns a boolean environment variable value."""
    raw = _env(name, "").lower()
    if raw == "":
        return bool(default)
    return raw in ("1", "true", "t", "yes", "y", "on")


def _heartbeat_every_seconds() -> int:
    """Returns the default active-loop heartbeat cadence."""
    return _env_int("RUNNER_HEARTBEAT_EVERY_SECONDS", 60, min_value=5)


def _market_closed_heartbeat_every_seconds() -> int:
    """Returns the off-hours heartbeat cadence."""
    return _env_int("RUNNER_MARKET_CLOSED_HEARTBEAT_SECONDS", 1800, min_value=60)


def _offline_heartbeat_every_seconds() -> int:
    """Returns the offline-state heartbeat cadence."""
    return _env_int("RUNNER_STOPPED_HEARTBEAT_SECONDS", 3600, min_value=60)


def _normalized_user_id(user_id: Optional[str]) -> str:
    """Returns a stripped user id or an empty string."""
    return str(user_id or "").strip()


def _normalized_runner_id() -> Optional[str]:
    """Returns the runner id from environment when present."""
    value = _env("RUNNER_ID") or _env("RUNNER_DEVICE_ID")
    return value or None


@dataclass
class HeartbeatState:
    """Mutable anti-spam state for runner heartbeat emission."""

    last_hb_ts: int = 0
    last_signature: str = ""


def normalize_runtime_state(value: Any) -> str:
    """Normalizes runtime states to the backend canonical set."""
    normalized = str(value or "").strip().lower()

    if normalized in {"running", "active", "live"}:
        return "running"
    if normalized in {"starting", "booting", "initializing"}:
        return "starting"
    if normalized in {"stopping", "shutting_down", "shutting-down"}:
        return "stopping"
    if normalized in {"errored", "error", "failed", "fatal"}:
        return "errored"
    if normalized in {"offline", "stopped", "idle", "dead", ""}:
        return "offline"

    return "offline"


def should_heartbeat(
    state: HeartbeatState,
    signature: str,
    *,
    now: int,
    every_seconds: Optional[int] = None,
) -> bool:
    """Returns whether a heartbeat should be emitted."""
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
    """Attempts to post a heartbeat without breaking the runner loop."""
    debug = _env_bool("RUNNER_DEBUG", False)

    uid = str(kwargs.get("user_id") or "").strip()
    if not uid:
        return

    payload = dict(kwargs)
    payload["runner_id"] = payload.get("runner_id") or _normalized_runner_id()

    runtime_state = payload.get("runtime_state")
    effective_state = payload.get("effective_state")
    canonical = normalize_runtime_state(runtime_state or effective_state)

    try:
        api_client.post_heartbeat(
            api,
            user_id=uid,
            bot_id=str(payload.get("bot_id") or "").strip(),
            runtime_state=canonical,
            mode=str(payload.get("mode") or "paper").strip().lower() or "paper",
            message=str(payload.get("message") or "").strip() or None,
            reason_code=str(payload.get("reason_code") or "").strip() or None,
            paused_reason=str(payload.get("paused_reason") or "").strip() or None,
            next_open_epoch=payload.get("next_open_epoch"),
            last_error=str(payload.get("last_error") or "").strip() or None,
            runner_id=payload.get("runner_id"),
        )
    except Exception as exc:
        if debug:
            print("[runner] heartbeat failed:", repr(exc))


def send_offline(
    api: UStockAPI,
    state: HeartbeatState,
    *,
    bot_id: str,
    status_mode: str,
    user_id: Optional[str] = None,
    reason_code: str = "intent_stopped",
    message: str = "Control plane indicates stopped.",
) -> None:
    """Emits a low-frequency offline heartbeat.

    This prevents status freshness from drifting forever while the bot is
    intentionally not running.
    """
    uid = _normalized_user_id(user_id)
    if not uid:
        return

    now = now_epoch()
    signature = f"offline|{status_mode}|{reason_code}"

    if should_heartbeat(
        state,
        signature,
        now=now,
        every_seconds=_offline_heartbeat_every_seconds(),
    ):
        safe_heartbeat(
            api,
            user_id=uid,
            bot_id=bot_id,
            mode=status_mode,
            runner_id=_normalized_runner_id(),
            runtime_state="offline",
            reason_code=reason_code,
            message=message,
            paused_reason="",
            last_error="",
        )


def send_stopped(
    api: UStockAPI,
    state: HeartbeatState,
    *,
    bot_id: str,
    status_mode: str,
    user_id: Optional[str] = None,
) -> None:
    """Backward-compatible wrapper for older runner call sites."""
    send_offline(
        api,
        state,
        bot_id=bot_id,
        status_mode=status_mode,
        user_id=user_id,
        reason_code="intent_stopped",
        message="Control plane indicates stopped.",
    )


class MarketClosed(Exception):
    """Raised when the market is closed and the runner should short-circuit."""

    def __init__(
        self,
        *,
        next_open_epoch: Optional[int] = None,
        reason: str = "Market closed",
    ) -> None:
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
    """Raises MarketClosed when the market is closed.

    When the market is closed, this function emits a throttled heartbeat using
    canonical runtime_state='running' plus a paused_reason that explains why
    work is paused. We keep runtime state canonical and let the backend/logs
    carry the richer explanation.
    """
    debug = _env_bool("RUNNER_DEBUG", False)

    session = api_client.market_session(api, bot_id)

    if not bool(session.get("ok")):
        if debug:
            print("[runner] market_session not ok; fail-open", session)
        return

    if bool(session.get("is_open")):
        return

    paused_reason = str(session.get("reason") or "Market closed").strip() or "Market closed"
    next_open = session.get("next_open")
    next_open_epoch: Optional[int] = int(next_open) if isinstance(next_open, (int, float)) else None

    uid = _normalized_user_id(user_id)
    now = now_epoch()
    signature = f"market_closed|{mode}|{next_open_epoch}"

    if uid and should_heartbeat(
        state,
        signature,
        now=now,
        every_seconds=_market_closed_heartbeat_every_seconds(),
    ):
        safe_heartbeat(
            api,
            user_id=uid,
            bot_id=bot_id,
            mode=mode,
            runner_id=_normalized_runner_id(),
            runtime_state="running",
            reason_code="market_closed",
            message="Waiting for market open.",
            paused_reason=paused_reason,
            last_error="",
            next_open_epoch=next_open_epoch,
        )

    raise MarketClosed(next_open_epoch=next_open_epoch, reason=paused_reason)