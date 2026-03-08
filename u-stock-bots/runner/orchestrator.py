# u-stock-bots/runner/orchestrator.py
from __future__ import annotations

import os
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

from bots._shared.ustock_http import UStockAPI

from runner.engine import BotEngine
from runner.supabase import upload_transaction_events
from runner import api_client
from runner.config_loader import build_bot_cfg
from runner.events import attach_event_id, merge_events, new_event_id, now_iso
from runner.heartbeat import (
    HeartbeatState,
    MarketClosed,
    gate_market_hours,
    send_stopped,
    safe_heartbeat,
    now_epoch,
)
from runner.risk import RiskState, filter_intents_with_gates, record_orders_placed
from runner.scanner import attach_scanner_context
from runner.strategy_loader import compute_bot_output


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if raw == "":
        return default
    return raw in ("1", "true", "t", "yes", "y", "on")


def _env_int(name: str, default: int, *, min_value: int = 0) -> int:
    raw = (os.getenv(name) or "").strip()
    if raw == "":
        return default
    try:
        v = int(raw)
    except Exception:
        return default
    return v if v >= int(min_value) else int(min_value)


def _sleep_smart(seconds: float, *, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    # Avoid 0 sleep tight-loops; also clamp negatives from tick runtime overage.
    sleep_fn(max(0.2, float(seconds)))


def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _extract_mode_cfg(status: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    cfg = (status.get("config") or {}) if isinstance(status.get("config"), dict) else {}
    mode = _normalize_mode(status.get("mode") or cfg.get("mode") or "paper")
    return mode, cfg


def _runner_user_id() -> str:
    """
    Runner endpoints require user_id. Prefer explicit env.
    """
    return (os.getenv("RUNNER_USER_ID") or os.getenv("USTOCK_USER_ID") or "").strip()


def _pick_user_id_from_status(status: Dict[str, Any]) -> str:
    """
    status_runner should return user_id, but we also keep env fallback.
    """
    uid = str(status.get("user_id") or "").strip()
    return uid or _runner_user_id()


def _normalize_intent(raw: Any) -> str:
    v = str(raw or "").strip().lower()
    if v == "paused":
        v = "stopped"
    return v if v in ("running", "stopped") else "stopped"


def _bucket_gate_reason(reason: str) -> str:
    """
    Bucket noisy reasons so tiny string differences don't spam.
    """
    r = (reason or "").strip().lower()
    if not r:
        return ""
    if "blocked: no valid intents" in r:
        return "blocked_no_valid_intents"
    if r.startswith("soft_block"):
        return "soft_block"
    if "symbol not in allowlist" in r:
        return "blocked_allowlist"
    if "kill switch" in r:
        return "blocked_killswitch"
    if "paper-only gate" in r:
        return "blocked_paper_only"
    return r


def _should_emit_block_event(
    hb_state: HeartbeatState,
    *,
    mode: str,
    gate_reason: str,
    now: int,
    block_log_min_seconds: int,
) -> bool:
    """
    Anti-spam for "blocked: ..." log events.
    Emit if:
      - bucketed reason changes, OR
      - enough time passed since last emission for same bucket
    Uses extra attrs on HeartbeatState (safe in Python).
    """
    reason = (gate_reason or "").strip()
    bucket = _bucket_gate_reason(reason)
    if not bucket:
        return False

    sig = f"block_evt|{mode}|{bucket}"

    last_sig = str(getattr(hb_state, "last_block_sig", "") or "")
    last_ts = int(getattr(hb_state, "last_block_ts", 0) or 0)

    if sig != last_sig:
        hb_state.last_block_sig = sig  # type: ignore[attr-defined]
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
    """
    Emit a runtime heartbeat every N loops, or immediately when the signature changes.
    This keeps runtime_state fresh without writing every single loop.
    """
    n = max(1, int(heartbeat_every_loops))
    last_sig = str(getattr(hb_state, "last_runtime_sig", "") or "")
    loop_count = int(getattr(hb_state, "runtime_loop_count", 0) or 0) + 1

    hb_state.runtime_loop_count = loop_count  # type: ignore[attr-defined]

    if sig != last_sig:
        hb_state.last_runtime_sig = sig  # type: ignore[attr-defined]
        hb_state.last_runtime_hb_ts = now  # type: ignore[attr-defined]
        hb_state.runtime_loop_count = 0  # type: ignore[attr-defined]
        return True

    if loop_count >= n:
        hb_state.last_runtime_hb_ts = now  # type: ignore[attr-defined]
        hb_state.runtime_loop_count = 0  # type: ignore[attr-defined]
        return True

    return False


def run_once(
    api: UStockAPI,
    *,
    bot_id: str,
    respect_market_hours: bool,
    risk_state: RiskState,
    hb_state: HeartbeatState,
    heartbeat_every_loops: int,
    block_log_min_seconds: int,
) -> None:
    """
    status -> market gate -> scanner -> strategy -> risk gate -> execution -> sink -> heartbeat
    """
    status = api_client.get_status(api, bot_id)

    user_id = _pick_user_id_from_status(status)
    intent = _normalize_intent(status.get("intent"))
    status_mode = _normalize_mode(status.get("mode") or "paper")

    if not user_id:
        raise RuntimeError(
            "Runner missing user_id. Set RUNNER_USER_ID in u-stock-bots env "
            "or ensure backend status_runner returns user_id."
        )

    if intent != "running":
        send_stopped(api, hb_state, bot_id=bot_id, status_mode=status_mode, user_id=user_id)
        return

    mode, status_cfg = _extract_mode_cfg(status)

    if respect_market_hours:
        gate_market_hours(api, hb_state, bot_id=bot_id, mode=mode, user_id=user_id)

    decision_event_id = new_event_id()

    # scanner context (symbols + source meta)
    status_cfg, scan_events = attach_scanner_context(api, status_cfg)
    attach_event_id(scan_events, decision_event_id)

    # build final cfg (env baseline -> status overrides -> scanner injected)
    scanner_ctx = status_cfg.get("scanner") if isinstance(status_cfg, dict) else None
    cfg = build_bot_cfg(
        bot_id=bot_id,
        status_cfg=status_cfg,
        scanner_ctx=scanner_ctx if isinstance(scanner_ctx, dict) else None,
    )

    # Strategy
    result = compute_bot_output(api, bot_id, cfg)
    intents = [x for x in (result.get("intents") or []) if isinstance(x, dict)]
    strat_events = [x for x in (result.get("events") or []) if isinstance(x, dict)]
    attach_event_id(strat_events, decision_event_id)

    # Keep identical behavior: scan events + strategy events
    strat_events = merge_events(scan_events, strat_events)

    # Risk + safety gates
    gated_intents, gate_reason = filter_intents_with_gates(
        state=risk_state,
        mode=mode,
        cfg=cfg,
        intents=intents,
        status=status,
    )

    # Always report what strategy wanted (even if gated)
    api_client.submit_intents(api, bot_id, intents, user_id=user_id)

    # -----------------------------
    # GATED (no execution)
    # -----------------------------
    if not gated_intents:
        combined: List[Dict[str, Any]] = []
        combined.extend(strat_events)

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
                        "payload": {"mode": mode, "reason": gate_reason, "bot_id": bot_id},
                    }
                )

        if combined:
            attach_event_id(combined, decision_event_id)
            upload_transaction_events(user_id, bot_id, mode, combined)

        now = now_epoch()
        gated_bucket = _bucket_gate_reason(str(gate_reason or ""))
        sig = f"gated|{mode}|{gated_bucket}"

        if _should_emit_cadence_heartbeat(
            hb_state,
            sig=sig,
            now=now,
            heartbeat_every_loops=heartbeat_every_loops,
        ):
            safe_heartbeat(
                api,
                user_id=user_id,
                bot_id=bot_id,
                intent="running",
                effective_state="running",
                mode=mode,
                reason_code="risk_gate",
                message=gate_reason or "Risk gate block.",
                last_error=None,
                last_tick=now,
            )

        return

    # -----------------------------
    # EXECUTION
    # -----------------------------
    engine = BotEngine(mode=mode)
    tx_events = engine.execute_intents(gated_intents)
    attach_event_id(tx_events, decision_event_id)

    placed = 0
    for e in tx_events:
        if isinstance(e, dict) and str(e.get("event_type") or "").lower() == "order_submitted":
            placed += 1
    record_orders_placed(risk_state, placed)

    combined = merge_events(strat_events, tx_events)
    attach_event_id(combined, decision_event_id)

    upload_transaction_events(user_id, bot_id, mode, combined)
    try:
        api_client.sync_trade_fills(api, bot_id=bot_id, mode=mode, user_id=user_id)
    except Exception:
        pass

    now = now_epoch()
    sig = f"loop_ok|{mode}"

    if _should_emit_cadence_heartbeat(
        hb_state,
        sig=sig,
        now=now,
        heartbeat_every_loops=heartbeat_every_loops,
    ):
        safe_heartbeat(
            api,
            user_id=user_id,
            bot_id=bot_id,
            intent="running",
            effective_state="running",
            mode=mode,
            reason_code="loop_ok",
            message="Loop active.",
            last_error=None,
            last_tick=now,
        )


def main(*, max_loops: Optional[int] = None, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    # Read env at runtime (after runner/main.py has normalized env)
    base_url = os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000").strip()

    loop_seconds = _env_int("RUNNER_LOOP_SECONDS", 5, min_value=1)
    bot_id = (os.getenv("RUNNER_BOT_ID") or "ema_trend").strip() or "ema_trend"
    respect_market_hours = _env_bool("RUNNER_RESPECT_MARKET_HOURS", True)

    # heartbeat cadence: every N loops
    heartbeat_every_loops = _env_int("RUNNER_HEARTBEAT_EVERY_LOOPS", 6, min_value=1)

    # block event anti-spam
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

    # Remember last known mode for better error reporting
    last_known_mode = "paper"

    with UStockAPI(base_url=base_url, timeout=15) as api:
        while True:
            if max_loops is not None and loops >= int(max_loops):
                return
            loops += 1

            t0 = time.time()

            try:
                run_once(
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
                _sleep_smart(loop_seconds - (time.time() - t0), sleep_fn=sleep_fn)
                continue

            except Exception as e:
                fail_streak += 1
                now = now_epoch()

                uid = _runner_user_id() or None
                mode = last_known_mode

                # Heartbeat is best-effort; only attempt if we have a uid
                if uid:
                    safe_heartbeat(
                        api,
                        user_id=uid,
                        bot_id=bot_id,
                        intent="running",
                        effective_state="error",
                        mode=mode,
                        reason_code="runner_exception",
                        message="Runner exception.",
                        last_error=repr(e),
                        last_tick=now,
                    )
                else:
                    print(f"[runner] exception (no user_id yet): {type(e).__name__}: {e!r}")

                # Exponential-ish backoff, capped
                backoff = min(8.0, float(2 ** max(0, min(fail_streak, 4)) - 1))
                _sleep_smart(backoff, sleep_fn=sleep_fn)

            _sleep_smart(loop_seconds - (time.time() - t0), sleep_fn=sleep_fn)


if __name__ == "__main__":
    main()