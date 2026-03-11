# u-stock-bots/runner/heartbeat.py
from __future__ import annotations

"""Heartbeat and market-hours helpers for runner loops.

This module centralizes runner heartbeat cadence, anti-spam behavior, and
market-hours gating used by bot orchestration loops.

Responsibilities:
    - throttle heartbeat emission
    - emit low-frequency stopped heartbeats
    - emit waiting-for-market heartbeats during off-hours
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
    """Returns the current epoch time in seconds.

    Returns:
        int: Current Unix timestamp in seconds.
    """
    return int(time.time())


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        str: Trimmed environment variable value or the provided default.
    """
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int, *, min_value: int = 1) -> int:
    """Returns an integer environment variable with lower-bound enforcement.

    Args:
        name: Environment variable name.
        default: Fallback integer value if parsing fails.
        min_value: Minimum allowed value.

    Returns:
        int: Parsed integer value clamped to the provided minimum.
    """
    raw = _env(name, "")
    if raw == "":
        return max(int(min_value), int(default))

    try:
        value = int(raw)
    except Exception:
        value = int(default)

    return max(int(min_value), int(value))


def _env_bool(name: str, default: bool = False) -> bool:
    """Returns a boolean environment variable value.

    Truthy values include: 1, true, t, yes, y, on.

    Args:
        name: Environment variable name.
        default: Fallback boolean value.

    Returns:
        bool: Parsed boolean value.
    """
    raw = _env(name, "").lower()
    if raw == "":
        return bool(default)
    return raw in ("1", "true", "t", "yes", "y", "on")


def _heartbeat_every_seconds() -> int:
    """Returns the default active-loop heartbeat cadence.

    Returns:
        int: Heartbeat cadence in seconds, with a minimum of 5.
    """
    return _env_int("RUNNER_HEARTBEAT_EVERY_SECONDS", 60, min_value=5)


def _market_closed_heartbeat_every_seconds() -> int:
    """Returns the off-hours heartbeat cadence.

    Returns:
        int: Heartbeat cadence in seconds while the market is closed, with a
        minimum of 60.
    """
    return _env_int("RUNNER_MARKET_CLOSED_HEARTBEAT_SECONDS", 1800, min_value=60)


def _stopped_heartbeat_every_seconds() -> int:
    """Returns the stopped-state heartbeat cadence.

    Returns:
        int: Heartbeat cadence in seconds while explicitly stopped, with a
        minimum of 60.
    """
    return _env_int("RUNNER_STOPPED_HEARTBEAT_SECONDS", 3600, min_value=60)


def _normalized_user_id(user_id: Optional[str]) -> str:
    """Returns a stripped user id or an empty string.

    Args:
        user_id: Optional user id.

    Returns:
        str: Trimmed user id if present, otherwise an empty string.
    """
    return str(user_id or "").strip()


@dataclass
class HeartbeatState:
    """Mutable anti-spam state for runner heartbeat emission.

    Attributes:
        last_hb_ts: Epoch timestamp of the last emitted heartbeat.
        last_signature: Signature of the last emitted heartbeat payload shape.
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
    """Returns whether a heartbeat should be emitted.

    Anti-spam policy:
        - emit immediately if the heartbeat signature changes
        - otherwise emit only after the cadence window has elapsed

    The function updates the shared HeartbeatState when it decides to emit.

    Args:
        state: Shared heartbeat state.
        signature: Signature representing the current heartbeat-relevant state.
        now: Current epoch time in seconds.
        every_seconds: Optional explicit cadence override.

    Returns:
        bool: True if a heartbeat should be emitted now.
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
    """Attempts to post a heartbeat without breaking the runner loop.

    If `RUNNER_DEBUG=true`, failures are printed for local visibility.
    Otherwise they are swallowed intentionally to keep the orchestrator loop
    alive.

    Args:
        api: Shared HTTP client.
        **kwargs: Keyword arguments forwarded to `api_client.post_heartbeat`.

    Returns:
        None
    """
    debug = _env_bool("RUNNER_DEBUG", False)

    uid = str(kwargs.get("user_id") or "").strip()
    if not uid:
        return

    try:
        api_client.post_heartbeat(api, **kwargs)
    except Exception as exc:
        if debug:
            print("[runner] heartbeat failed:", repr(exc))


def send_stopped(
    api: UStockAPI,
    state: HeartbeatState,
    *,
    bot_id: str,
    status_mode: str,
    user_id: Optional[str] = None,
) -> None:
    """Emits a low-frequency stopped heartbeat.

    This prevents UI freshness from drifting indefinitely when a bot remains
    explicitly stopped for a long period.

    Args:
        api: Shared HTTP client.
        state: Shared heartbeat anti-spam state.
        bot_id: Bot identifier.
        status_mode: Current bot mode, typically paper or live.
        user_id: Optional application user id.

    Returns:
        None
    """
    uid = _normalized_user_id(user_id)
    if not uid:
        return

    now = now_epoch()
    signature = f"stopped|{status_mode}|intent_stopped"

    if should_heartbeat(
        state,
        signature,
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
    """Raised when the market is closed and the runner should short-circuit.

    Attributes:
        next_open_epoch: Optional next known market-open epoch.
        reason: Human-readable market-closed reason.
    """

    def __init__(
        self,
        *,
        next_open_epoch: Optional[int] = None,
        reason: str = "Market closed",
    ) -> None:
        """Initializes the market-closed exception.

        Args:
            next_open_epoch: Optional next market-open epoch.
            reason: Human-readable reason.
        """
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

    When the market is closed, this function emits a throttled
    `waiting_for_market` heartbeat before raising `MarketClosed`.

    The market session lookup is intentionally fail-open. If the backend
    session endpoint fails or returns an unexpected response shape, the runner
    continues rather than stopping local or development flows.

    Args:
        api: Shared HTTP client.
        state: Shared heartbeat anti-spam state.
        bot_id: Bot identifier.
        mode: Current bot mode, typically paper or live.
        user_id: Optional application user id.

    Raises:
        MarketClosed: If the market session endpoint reports the market is
            closed.

    Returns:
        None
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
    signature = f"wait_market|{mode}|market_closed|{next_open_epoch}"

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