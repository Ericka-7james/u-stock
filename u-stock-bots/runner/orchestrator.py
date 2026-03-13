# u-stock-bots/runner/orchestrator.py
from __future__ import annotations

"""Main orchestration loop for U-Stock bot runners.

This module coordinates the runner execution lifecycle for a single bot:

1. Fetch runner-visible backend status.
2. Respect intent and market-hours gates.
3. Enrich config with scanner context.
4. Compute strategy output.
5. Apply risk gates.
6. Submit strategy intents for visibility.
7. Execute allowed intents.
8. Upload events and sync trade fills.
9. Emit throttled runtime heartbeats.

Design notes:
    - The orchestrator is intentionally fail-soft where possible.
    - Heartbeats are best-effort and should never crash the runner loop.
    - Market session checks are handled upstream through heartbeat helpers.
    - Environment variables remain the runtime source of truth.
    - Unknown or transitional control-plane states should not be collapsed into
      a hard stopped runtime state. Doing so can cause visible regressions such
      as starting -> stopped during normal propagation delay.
"""

import os
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from bots._shared.ustock_http import UStockAPI

from runner import api_client
from runner.config_loader import build_bot_cfg
from runner.engine import BotEngine
from runner.events import attach_event_id, merge_events, new_event_id, now_iso
from runner.heartbeat import (
    HeartbeatState,
    MarketClosed,
    gate_market_hours,
    now_epoch,
    safe_heartbeat,
    send_stopped,
)
from runner.risk import RiskState, filter_intents_with_gates, record_orders_placed
from runner.scanner import attach_scanner_context
from runner.strategy_loader import compute_bot_output
from runner.supabase import upload_transaction_events


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        Trimmed environment variable value or the provided default.
    """
    return str(os.getenv(name, default) or "").strip()


def _env_bool(name: str, default: bool) -> bool:
    """Returns a boolean environment variable value.

    Truthy values include: 1, true, t, yes, y, on.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        Parsed boolean value.
    """
    raw = _env(name, "").lower()
    if raw == "":
        return bool(default)
    return raw in ("1", "true", "t", "yes", "y", "on")


def _env_int(name: str, default: int, *, min_value: int = 0) -> int:
    """Returns an integer environment variable with lower-bound enforcement.

    Args:
        name: Environment variable name.
        default: Fallback integer value if parsing fails.
        min_value: Minimum allowed value.

    Returns:
        Parsed integer value clamped to the provided minimum.
    """
    raw = _env(name, "")
    if raw == "":
        return int(default)

    try:
        value = int(raw)
    except Exception:
        value = int(default)

    return value if value >= int(min_value) else int(min_value)


def _sleep_smart(seconds: float, *, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    """Sleeps safely without allowing tight zero-delay loops.

    Negative or tiny values are clamped to a small floor to avoid busy-looping
    when iteration work already consumed the nominal loop interval.

    Args:
        seconds: Requested sleep duration.
        sleep_fn: Sleep function, injectable for tests.
    """
    sleep_fn(max(0.2, float(seconds)))


def _normalize_mode(raw: Any) -> str:
    """Normalizes a bot mode string.

    Args:
        raw: Raw mode value.

    Returns:
        Normalized mode, either "paper" or "live".
    """
    mode = str(raw or "paper").strip().lower()
    return mode if mode in ("paper", "live") else "paper"


def _extract_mode_cfg(status: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """Extracts normalized mode and config from a status payload.

    Args:
        status: Backend status payload.

    Returns:
        Tuple of normalized mode and config object.
    """
    cfg = status.get("config") if isinstance(status.get("config"), dict) else {}
    mode = _normalize_mode(status.get("mode") or cfg.get("mode") or "paper")
    return mode, cfg


def _runner_user_id() -> str:
    """Returns the configured runner user id.

    Returns:
        Runner user id from preferred or legacy environment variables.
    """
    return _env("RUNNER_USER_ID") or _env("USTOCK_USER_ID")


def _pick_user_id_from_status(status: Dict[str, Any]) -> str:
    """Resolves the effective user id for the runner loop.

    Prefers the backend status payload and falls back to environment.

    Args:
        status: Backend status payload.

    Returns:
        Effective application user id, or an empty string.
    """
    uid = str(status.get("user_id") or "").strip()
    return uid or _runner_user_id()


def _normalize_intent(raw: Any) -> str:
    """Normalizes an intent string.

    Args:
        raw: Raw intent value.

    Returns:
        Normalized intent when recognized, otherwise an empty string.

    Notes:
        This intentionally does not collapse unknown values to "stopped".
        Treating missing or stale control-plane reads as stopped can cause the
        runner to overwrite a transitional "starting" state with "stopped".
    """
    value = str(raw or "").strip().lower()
    if value == "paused":
        value = "stopped"
    if value in ("running", "stopped"):
        return value
    return ""


def _bucket_gate_reason(reason: str) -> str:
    """Buckets noisy gate reasons to reduce event spam.

    Args:
        reason: Raw gate reason string.

    Returns:
        Bucketed gate reason.
    """
    raw = (reason or "").strip().lower()
    if not raw:
        return ""
    if "blocked: no valid intents" in raw:
        return "blocked_no_valid_intents"
    if raw.startswith("soft_block"):
        return "soft_block"
    if "symbol not in allowlist" in raw:
        return "blocked_allowlist"
    if "kill switch" in raw:
        return "blocked_killswitch"
    if "paper-only gate" in raw:
        return "blocked_paper_only"
    return raw


def _should_emit_block_event(
    hb_state: HeartbeatState,
    *,
    mode: str,
    gate_reason: str,
    now: int,
    block_log_min_seconds: int,
) -> bool:
    """Returns whether a risk-gate block event should be emitted.

    Anti-spam policy:
        - emit immediately if the bucketed reason changes
        - otherwise emit only after the minimum cadence interval

    The function stores lightweight state on the shared HeartbeatState object.

    Args:
        hb_state: Shared heartbeat anti-spam state.
        mode: Current bot mode.
        gate_reason: Raw gate reason.
        now: Current epoch time.
        block_log_min_seconds: Minimum interval for repeated block events.

    Returns:
        True if a block event should be emitted now.
    """
    bucket = _bucket_gate_reason(gate_reason)
    if not bucket:
        return False

    signature = f"block_evt|{mode}|{bucket}"

    last_sig = str(getattr(hb_state, "last_block_sig", "") or "")
    last_ts = int(getattr(hb_state, "last_block_ts", 0) or 0)

    if signature != last_sig:
        hb_state.last_block_sig = signature  # type: ignore[attr-defined]
        hb_state.last_block_ts = now  # type: ignore[attr-defined]
        return True

    if now - last_ts >= int(block_log_min_seconds):
        hb_state.last_block_ts = now  # type: ignore[attr-defined]
        return True

    return False


def _should_emit_cadence_heartbeat(
    hb_state: HeartbeatState,
    *,
    sig: str,
    now: int,
    heartbeat_every_loops: int,
) -> bool:
    """Returns whether a runtime heartbeat should be emitted.

    Policy:
        - emit immediately when the runtime signature changes
        - otherwise emit every N loops

    Args:
        hb_state: Shared heartbeat anti-spam state.
        sig: Runtime signature for the current loop state.
        now: Current epoch time.
        heartbeat_every_loops: Loop-based emission cadence.

    Returns:
        True if a heartbeat should be emitted now.
    """
    every_n = max(1, int(heartbeat_every_loops))
    last_sig = str(getattr(hb_state, "last_runtime_sig", "") or "")
    loop_count = int(getattr(hb_state, "runtime_loop_count", 0) or 0) + 1

    hb_state.runtime_loop_count = loop_count  # type: ignore[attr-defined]

    if sig != last_sig:
        hb_state.last_runtime_sig = sig  # type: ignore[attr-defined]
        hb_state.last_runtime_hb_ts = now  # type: ignore[attr-defined]
        hb_state.runtime_loop_count = 0  # type: ignore[attr-defined]
        return True

    if loop_count >= every_n:
        hb_state.last_runtime_hb_ts = now  # type: ignore[attr-defined]
        hb_state.runtime_loop_count = 0  # type: ignore[attr-defined]
        return True

    return False


def _count_submitted_orders(events: List[Dict[str, Any]]) -> int:
    """Counts submitted-order events.

    Args:
        events: Execution event list.

    Returns:
        Number of order_submitted events.
    """
    count = 0
    for event in events:
        if isinstance(event, dict) and str(event.get("event_type") or "").lower() == "order_submitted":
            count += 1
    return count


def _runtime_heartbeat(
    api: UStockAPI,
    *,
    user_id: str,
    bot_id: str,
    mode: str,
    reason_code: str,
    message: Optional[str],
    effective_state: str = "running",
    last_error: Optional[str] = None,
) -> None:
    """Sends a best-effort runtime heartbeat.

    Args:
        api: Shared HTTP client.
        user_id: Application user id.
        bot_id: Bot identifier.
        mode: Current bot mode.
        reason_code: Machine-readable reason code.
        message: Human-readable message.
        effective_state: Effective runner state.
        last_error: Optional error message.
    """
    safe_heartbeat(
        api,
        user_id=user_id,
        bot_id=bot_id,
        intent="running",
        effective_state=effective_state,
        mode=mode,
        reason_code=reason_code,
        message=message,
        last_error=last_error,
        last_tick=now_epoch(),
    )


def run_once(
    api: UStockAPI,
    *,
    bot_id: str,
    respect_market_hours: bool,
    risk_state: RiskState,
    hb_state: HeartbeatState,
    heartbeat_every_loops: int,
    block_log_min_seconds: int,
) -> str:
    """Runs one orchestrator iteration.

    Flow:
        status -> market gate -> scanner -> strategy -> risk gate
        -> execution -> event sink -> heartbeat

    Args:
        api: Shared HTTP client.
        bot_id: Bot identifier.
        respect_market_hours: Whether to gate execution on market session.
        risk_state: Shared in-memory risk state.
        hb_state: Shared heartbeat anti-spam state.
        heartbeat_every_loops: Runtime heartbeat loop cadence.
        block_log_min_seconds: Minimum interval between repeated block events.

    Raises:
        RuntimeError: If no usable user id is available.
        MarketClosed: If market-hours gating blocks execution.

    Returns:
        Last known normalized mode for the iteration.
    """
    status = api_client.get_status(api, bot_id)

    user_id = _pick_user_id_from_status(status)
    intent = _normalize_intent(status.get("intent"))
    status_mode = _normalize_mode(status.get("mode") or "paper")
    effective_state = str(status.get("effective_state") or "").strip().lower()

    if not user_id:
        raise RuntimeError(
            "Runner missing user_id. Set RUNNER_USER_ID in u-stock-bots env "
            "or ensure backend status_runner returns user_id."
        )

    if intent == "stopped":
        send_stopped(api, hb_state, bot_id=bot_id, status_mode=status_mode, user_id=user_id)
        return status_mode

    if intent != "running":
        now = now_epoch()
        signature = f"control_unknown|{status_mode}|{effective_state or 'unknown'}"
        if _should_emit_cadence_heartbeat(
            hb_state,
            sig=signature,
            now=now,
            heartbeat_every_loops=heartbeat_every_loops,
        ):
            _runtime_heartbeat(
                api,
                user_id=user_id,
                bot_id=bot_id,
                mode=status_mode,
                reason_code="control_state_pending",
                message="Runner waiting for control-plane running state.",
                effective_state="starting" if effective_state in {"", "starting"} else effective_state,
            )
        return status_mode

    mode, status_cfg = _extract_mode_cfg(status)

    if respect_market_hours:
        gate_market_hours(api, hb_state, bot_id=bot_id, mode=mode, user_id=user_id)

    decision_event_id = new_event_id()

    status_cfg, scan_events = attach_scanner_context(api, status_cfg)
    attach_event_id(scan_events, decision_event_id)

    scanner_ctx = status_cfg.get("scanner") if isinstance(status_cfg, dict) else None
    cfg = build_bot_cfg(
        bot_id=bot_id,
        status_cfg=status_cfg,
        scanner_ctx=scanner_ctx if isinstance(scanner_ctx, dict) else None,
    )

    result = compute_bot_output(api, bot_id, cfg)
    intents = [item for item in (result.get("intents") or []) if isinstance(item, dict)]
    strategy_events = [item for item in (result.get("events") or []) if isinstance(item, dict)]
    attach_event_id(strategy_events, decision_event_id)

    strategy_events = merge_events(scan_events, strategy_events)

    gated_intents, gate_reason = filter_intents_with_gates(
        state=risk_state,
        mode=mode,
        cfg=cfg,
        intents=intents,
        status=status,
    )

    api_client.submit_intents(api, bot_id, intents, user_id=user_id)

    if not gated_intents:
        combined: List[Dict[str, Any]] = []
        combined.extend(strategy_events)

        if gate_reason:
            now = now_epoch()
            if _should_emit_block_event(
                hb_state,
                mode=mode,
                gate_reason=str(gate_reason),
                now=now,
                block_log_min_seconds=block_log_min_seconds,
            ):
                combined.append(
                    {
                        "ts": now_iso(),
                        "event_type": "risk_gate_block",
                        "level": "info",
                        "symbol": None,
                        "event_id": decision_event_id,
                        "payload": {
                            "mode": mode,
                            "reason": gate_reason,
                            "bot_id": bot_id,
                        },
                    }
                )

        if combined:
            attach_event_id(combined, decision_event_id)
            upload_transaction_events(user_id, bot_id, mode, combined)

        now = now_epoch()
        gated_bucket = _bucket_gate_reason(str(gate_reason or ""))
        signature = f"gated|{mode}|{gated_bucket or 'no_intents'}"

        if _should_emit_cadence_heartbeat(
            hb_state,
            sig=signature,
            now=now,
            heartbeat_every_loops=heartbeat_every_loops,
        ):
            blocked_state = "paused" if gate_reason else "running"
            blocked_reason = gate_reason or "No actionable intents this loop."
            blocked_code = "risk_gate" if gate_reason else "no_valid_intents"

            _runtime_heartbeat(
                api,
                user_id=user_id,
                bot_id=bot_id,
                mode=mode,
                reason_code=blocked_code,
                message=blocked_reason,
                effective_state=blocked_state,
            )

        return mode

    engine = BotEngine(mode=mode)
    execution_events = engine.execute_intents(gated_intents)
    attach_event_id(execution_events, decision_event_id)

    placed = _count_submitted_orders(execution_events)
    record_orders_placed(risk_state, placed)

    combined = merge_events(strategy_events, execution_events)
    attach_event_id(combined, decision_event_id)

    upload_transaction_events(user_id, bot_id, mode, combined)

    try:
        api_client.sync_trade_fills(api, bot_id=bot_id, mode=mode, user_id=user_id)
    except Exception:
        pass

    now = now_epoch()
    signature = f"loop_ok|{mode}"

    if _should_emit_cadence_heartbeat(
        hb_state,
        sig=signature,
        now=now,
        heartbeat_every_loops=heartbeat_every_loops,
    ):
        _runtime_heartbeat(
            api,
            user_id=user_id,
            bot_id=bot_id,
            mode=mode,
            reason_code="loop_ok",
            message="Loop active.",
            effective_state="running",
        )

    return mode


def main(*, max_loops: Optional[int] = None, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    """Runs the orchestrator loop.

    Args:
        max_loops: Optional maximum loop count. Useful for tests and one-shot runs.
        sleep_fn: Injectable sleep function for tests.
    """
    base_url = _env("USTOCK_API_BASE", "http://127.0.0.1:8000")
    loop_seconds = _env_int("RUNNER_LOOP_SECONDS", 5, min_value=1)
    bot_id = _env("RUNNER_BOT_ID", "ema_trend") or "ema_trend"
    respect_market_hours = _env_bool("RUNNER_RESPECT_MARKET_HOURS", True)
    heartbeat_every_loops = _env_int("RUNNER_HEARTBEAT_EVERY_LOOPS", 6, min_value=1)
    block_log_min_seconds = _env_int("RUNNER_BLOCK_LOG_MIN_SECONDS", 1800, min_value=10)
    debug = _env_bool("RUNNER_DEBUG", False)

    print(
        f"[runner] starting | base={base_url} | bot_id={bot_id} | loop={loop_seconds}s "
        f"| respect_market_hours={respect_market_hours} | heartbeat_every_loops={heartbeat_every_loops}"
    )

    loops = 0
    risk_state = RiskState()
    hb_state = HeartbeatState()
    fail_streak = 0
    last_known_mode = "paper"

    with UStockAPI(base_url=base_url, timeout=15) as api:
        while True:
            if max_loops is not None and loops >= int(max_loops):
                return

            loops += 1
            started_at = time.time()

            try:
                last_known_mode = run_once(
                    api,
                    bot_id=bot_id,
                    respect_market_hours=respect_market_hours,
                    risk_state=risk_state,
                    hb_state=hb_state,
                    heartbeat_every_loops=heartbeat_every_loops,
                    block_log_min_seconds=block_log_min_seconds,
                )
                fail_streak = 0

            except MarketClosed:
                if debug:
                    print(f"[runner] market closed | sleeping {loop_seconds}s")
                _sleep_smart(loop_seconds - (time.time() - started_at), sleep_fn=sleep_fn)
                continue

            except Exception as exc:
                fail_streak += 1
                uid = _runner_user_id() or None

                if uid:
                    _runtime_heartbeat(
                        api,
                        user_id=uid,
                        bot_id=bot_id,
                        mode=last_known_mode,
                        reason_code="runner_exception",
                        message="Runner exception.",
                        effective_state="error",
                        last_error=repr(exc),
                    )
                else:
                    print(f"[runner] exception (no user_id yet): {type(exc).__name__}: {exc!r}")

                backoff = min(8.0, float(2 ** max(0, min(fail_streak, 4)) - 1))
                _sleep_smart(backoff, sleep_fn=sleep_fn)

            _sleep_smart(loop_seconds - (time.time() - started_at), sleep_fn=sleep_fn)


if __name__ == "__main__":
    main()