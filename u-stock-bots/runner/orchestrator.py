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
from runner.heartbeat import HeartbeatState, MarketClosed, gate_market_hours, send_paused, safe_heartbeat, should_heartbeat, now_epoch
from runner.risk import RiskState, filter_intents_with_gates, record_orders_placed
from runner.scanner import attach_scanner_context
from runner.strategy_loader import compute_bot_output

# -----------------------------
# Env / constants
# -----------------------------
LOOP_SECONDS = int(os.getenv("RUNNER_LOOP_SECONDS", "5"))
BOT_ID = (os.getenv("RUNNER_BOT_ID") or "ema_trend").strip() or "ema_trend"


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if raw == "":
        return default
    return raw in ("1", "true", "t", "yes", "y", "on")


RESPECT_MARKET_HOURS = _env_bool("RUNNER_RESPECT_MARKET_HOURS", True)


def _sleep_smart(seconds: float, *, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    sleep_fn(max(0.2, float(seconds)))


def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _extract_mode_cfg(status: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    cfg = (status.get("config") or {}) if isinstance(status.get("config"), dict) else {}
    mode = _normalize_mode(status.get("mode") or cfg.get("mode") or "paper")
    return mode, cfg


def run_once(api: UStockAPI, *, risk_state: RiskState, hb_state: HeartbeatState) -> None:
    """
    Runs a single orchestrator loop:
      status -> market gate -> scanner -> bot strategy -> risk gate -> execution -> event sink -> heartbeat
    """
    status = api_client.get_status(api, BOT_ID)

    user_id = str(status.get("user_id") or "").strip()
    intent = str(status.get("intent") or "paused").strip().lower()
    status_mode = _normalize_mode(status.get("mode") or "paper")

    if intent != "running":
        send_paused(api, hb_state, bot_id=BOT_ID, status_mode=status_mode)
        return

    mode, status_cfg = _extract_mode_cfg(status)

    if RESPECT_MARKET_HOURS:
        gate_market_hours(api, hb_state, bot_id=BOT_ID, mode=mode)

    decision_event_id = new_event_id()

    # scanner context (symbols + source meta)
    status_cfg, scan_events = attach_scanner_context(api, status_cfg)
    attach_event_id(scan_events, decision_event_id)

    # ✅ build final cfg (env baseline -> status overrides -> scanner injected)
    scanner_ctx = status_cfg.get("scanner") if isinstance(status_cfg, dict) else None
    cfg = build_bot_cfg(bot_id=BOT_ID, status_cfg=status_cfg, scanner_ctx=scanner_ctx if isinstance(scanner_ctx, dict) else None)

    # Strategy (generic)
    result = compute_bot_output(api, BOT_ID, cfg)
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
    api_client.submit_intents(api, BOT_ID, intents)

    if not gated_intents:
        combined: List[Dict[str, Any]] = []
        combined.extend(strat_events)

        if gate_reason:
            combined.append(
                {
                    "ts": now_iso(),
                    "event_type": "risk_gate_block",
                    "level": "info",
                    "symbol": None,
                    "event_id": decision_event_id,
                    "payload": {"mode": mode, "reason": gate_reason, "bot_id": BOT_ID},
                }
            )

        attach_event_id(combined, decision_event_id)

        if user_id:
            upload_transaction_events(user_id, BOT_ID, mode, combined)

        now = now_epoch()
        sig = f"running|{mode}|gated|{gate_reason}"
        if should_heartbeat(hb_state, sig, now=now):
            safe_heartbeat(
                api,
                bot_id=BOT_ID,
                intent="running",
                effective_state="running",
                mode=mode,
                reason_code="risk_gate",
                message=gate_reason or "Risk gate block.",
                last_error=None,
                last_tick=now,
            )
        return

    # Execution
    engine = BotEngine(mode=mode)
    tx_events = engine.execute_intents(gated_intents)
    attach_event_id(tx_events, decision_event_id)

    placed = 0
    for e in tx_events:
        if isinstance(e, dict) and str(e.get("event_type") or "").lower() == "order_submitted":
            placed += 1
    record_orders_placed(risk_state, placed)

    # Event sink (tx-only + strategy events)
    combined = merge_events(strat_events, tx_events)
    attach_event_id(combined, decision_event_id)

    if user_id:
        upload_transaction_events(user_id, BOT_ID, mode, combined)
        try:
            api_client.sync_trade_fills(api, user_id=user_id, bot_id=BOT_ID, mode=mode)
        except Exception:
            pass

    now = now_epoch()
    sig = f"running|{mode}|loop_ok"
    if should_heartbeat(hb_state, sig, now=now):
        safe_heartbeat(
            api,
            bot_id=BOT_ID,
            intent="running",
            effective_state="running",
            mode=mode,
            reason_code="loop_ok",
            message="Loop active.",
            last_error=None,
            last_tick=now,
        )


def main(*, max_loops: Optional[int] = None, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    base_url = os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000")
    print(
        f"[runner] starting | base={base_url} | bot_id={BOT_ID} | loop={LOOP_SECONDS}s "
        f"| respect_market_hours={RESPECT_MARKET_HOURS}"
    )

    loops = 0
    risk_state = RiskState()
    hb_state = HeartbeatState()

    with UStockAPI(base_url=base_url, timeout=15) as api:
        while True:
            if max_loops is not None and loops >= int(max_loops):
                return
            loops += 1

            t0 = time.time()

            try:
                run_once(api, risk_state=risk_state, hb_state=hb_state)

            except MarketClosed:
                _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)
                continue

            except Exception as e:
                mode = "paper"
                now = now_epoch()
                sig = f"error|{mode}|runner_exception|{type(e).__name__}"
                if should_heartbeat(hb_state, sig, now=now):
                    safe_heartbeat(
                        api,
                        bot_id=BOT_ID,
                        intent="running",
                        effective_state="error",
                        mode=mode,
                        reason_code="runner_exception",
                        message="Runner exception.",
                        last_error=repr(e),
                        last_tick=now,
                    )

            _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)


if __name__ == "__main__":
    main()
