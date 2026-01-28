# u-stock-bots/runner/bot_runner.py
from __future__ import annotations

import importlib
import os
import time
import uuid
from dataclasses import asdict, is_dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from bots._shared.ustock_http import UStockAPI
from runner.engine import BotEngine
from runner.supabase import upload_transaction_events

LOOP_SECONDS = int(os.getenv("RUNNER_LOOP_SECONDS", "5"))
BOT_ID = os.getenv("RUNNER_BOT_ID", "ema_trend")

# ✅ New: easy testing toggle (default True for prod-like behavior)
def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if raw == "":
        return default
    return raw in ("1", "true", "t", "yes", "y", "on")


RESPECT_MARKET_HOURS = _env_bool("RUNNER_RESPECT_MARKET_HOURS", True)

# ---- Heartbeat + anti-spam ----
HEARTBEAT_EVERY_SECONDS = int(os.getenv("RUNNER_HEARTBEAT_EVERY_SECONDS", "60"))
_last_hb_ts: int = 0
_last_hb_signature: str = ""

# ---- Simple in-runner risk counters ----
_orders_today: int = 0
_last_order_epoch: int = 0
_day_key: str = ""


def _new_event_id() -> str:
    # one per "decision" (per loop)
    return uuid.uuid4().hex


def _now() -> int:
    return int(time.time())


def _today_key_utc() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime())


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _sleep_smart(seconds: float, *, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    sleep_fn(max(0.2, float(seconds)))


def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _extract_mode_cfg(status: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    cfg = (status.get("config") or {}) if isinstance(status.get("config"), dict) else {}
    mode = _normalize_mode(status.get("mode") or cfg.get("mode") or "paper")
    return mode, cfg


def _should_heartbeat(signature: str, *, now: int) -> bool:
    """
    Proper heartbeat anti-spam:
    - send immediately if signature changed (state/intent/reason changes)
    - otherwise send at most every HEARTBEAT_EVERY_SECONDS
    """
    global _last_hb_ts, _last_hb_signature

    if signature != _last_hb_signature:
        _last_hb_signature = signature
        _last_hb_ts = now
        return True

    if now - _last_hb_ts >= HEARTBEAT_EVERY_SECONDS:
        _last_hb_ts = now
        return True

    return False


def _heartbeat(
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
    now = _now()
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


def _safe_heartbeat(api: UStockAPI, **kwargs: Any) -> None:
    try:
        _heartbeat(api, **kwargs)
    except Exception:
        return


def _submit_intents(api: UStockAPI, bot_id: str, intents: List[Dict[str, Any]]) -> None:
    api.post("/api/bots/submit-intents", json={"bot_id": bot_id, "ts": _now(), "items": intents})


def _get_status(api: UStockAPI, bot_id: str) -> Dict[str, Any]:
    # runner-authenticated endpoint (no cookies)
    return api.get("/api/bots/status_runner", params={"bot_id": bot_id})


def _market_session(api: UStockAPI) -> Dict[str, Any]:
    try:
        data = api.get("/api/market/us/session")
        return data if isinstance(data, dict) else {"ok": False}
    except Exception:
        return {"ok": False}


def _sync_trade_fills(api: UStockAPI, *, user_id: str, bot_id: str, mode: str) -> None:
    # runner-authenticated endpoint (no cookies)
    api.post("/api/trade_fills/sync_runner", json={"user_id": user_id, "bot_id": bot_id, "mode": mode})


# ----------------------------------------------------------
# Generic bot loader (BOT_ID -> bots.<bot_id>.bot)
# ----------------------------------------------------------
def _load_bot_module(bot_id: str):
    """
    BOT_ID=ema_trend -> imports bots.ema_trend.bot
    BOT_ID=orb       -> imports bots.orb.bot
    """
    mod_name = f"bots.{bot_id}.bot"
    return importlib.import_module(mod_name)


def _compute_intents_for_bot(api: UStockAPI, bot_id: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    """
    Supports these bot interfaces:
      1) generate_output(api=..., config=...) -> {"intents": [...], "events": [...]}
      2) generate_intents(api=..., config=...) -> [...]
      3) run(api=..., cfg=<dataclass or dict>) -> [...]
    """
    try:
        bot_mod = _load_bot_module(bot_id)
    except Exception as e:
        return {
            "intents": [],
            "events": [
                {
                    "ts": _now_iso(),
                    "event_type": "runner_bot_load_failed",
                    "level": "error",
                    "symbol": None,
                    "payload": {"bot_id": bot_id, "error": repr(e)},
                }
            ],
        }

    gen_out = getattr(bot_mod, "generate_output", None)
    if callable(gen_out):
        try:
            out = gen_out(api=api, config=cfg)
            if isinstance(out, dict):
                intents = out.get("intents") or []
                events = out.get("events") or []
                return {
                    "intents": intents if isinstance(intents, list) else [],
                    "events": events if isinstance(events, list) else [],
                }
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    {
                        "ts": _now_iso(),
                        "event_type": "runner_bot_generate_output_failed",
                        "level": "error",
                        "symbol": None,
                        "payload": {"bot_id": bot_id, "error": repr(e)},
                    }
                ],
            }

    gen_intents = getattr(bot_mod, "generate_intents", None)
    if callable(gen_intents):
        try:
            intents = gen_intents(api=api, config=cfg)
            return {"intents": intents if isinstance(intents, list) else [], "events": []}
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    {
                        "ts": _now_iso(),
                        "event_type": "runner_bot_generate_intents_failed",
                        "level": "error",
                        "symbol": None,
                        "payload": {"bot_id": bot_id, "error": repr(e)},
                    }
                ],
            }

    run_fn = getattr(bot_mod, "run", None)
    if callable(run_fn):
        try:
            intents_raw = run_fn(api=api, cfg=cfg) or []
            intents_out: List[Dict[str, Any]] = []
            for it in intents_raw:
                if isinstance(it, dict):
                    intents_out.append(it)
                elif is_dataclass(it):
                    intents_out.append(asdict(it))
                else:
                    intents_out.append(dict(getattr(it, "__dict__", {})))
            return {"intents": intents_out, "events": []}
        except Exception as e:
            return {
                "intents": [],
                "events": [
                    {
                        "ts": _now_iso(),
                        "event_type": "runner_bot_run_failed",
                        "level": "error",
                        "symbol": None,
                        "payload": {"bot_id": bot_id, "error": repr(e)},
                    }
                ],
            }

    return {
        "intents": [],
        "events": [
            {
                "ts": _now_iso(),
                "event_type": "runner_bot_no_entrypoint",
                "level": "error",
                "symbol": None,
                "payload": {"bot_id": bot_id, "expected": ["generate_output", "generate_intents", "run"]},
            }
        ],
    }


# ----------------------------------------------------------
# Risk + safety gates (runner-level)
# ----------------------------------------------------------
def _cfg_int(cfg: Dict[str, Any], *keys: str, default: int) -> int:
    for k in keys:
        v = cfg.get(k)
        try:
            if v is not None:
                return int(v)
        except Exception:
            pass
    return int(default)


def _cfg_list(cfg: Dict[str, Any], *keys: str) -> List[str]:
    for k in keys:
        v = cfg.get(k)
        if isinstance(v, list):
            out: List[str] = []
            for x in v:
                s = str(x or "").strip()
                if s:
                    out.append(s.upper())
            if out:
                return out
        if isinstance(v, str) and v.strip():
            out = [p.strip().upper() for p in v.split(",") if p.strip()]
            if out:
                return out
    return []


def _reset_daily_counters_if_needed() -> None:
    global _day_key, _orders_today
    tk = _today_key_utc()
    if _day_key != tk:
        _day_key = tk
        _orders_today = 0


def _filter_intents_with_gates(
    *,
    mode: str,
    cfg: Dict[str, Any],
    intents: List[Dict[str, Any]],
    status: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """
    Apply a minimal, production-safe gate set at runner level.
    Returns (filtered_intents, block_reason_if_all_blocked_or_empty)
    """
    _reset_daily_counters_if_needed()

    # A) Hard gates
    if mode != "paper":
        return [], "blocked: paper-only gate (mode != paper)"

    if bool(status.get("kill_switch") or cfg.get("kill_switch") or False):
        return [], "blocked: kill switch enabled"

    required = ("symbol", "side", "qty")
    cleaned: List[Dict[str, Any]] = []
    for it in intents:
        if not isinstance(it, dict):
            continue
        if any(it.get(k) in (None, "", 0, 0.0) for k in required):
            continue

        sym = str(it.get("symbol") or "").upper().strip()
        if not sym:
            continue

        it["symbol"] = sym
        it["side"] = str(it.get("side") or "").lower().strip()
        cleaned.append(it)

    if not cleaned:
        return [], "blocked: no valid intents"

    allow = _cfg_list(cfg, "allowed_symbols", "symbol_allowlist", "symbols")
    if allow:
        allow_set = set(allow)
        cleaned = [it for it in cleaned if str(it.get("symbol") or "").upper() in allow_set]
        if not cleaned:
            return [], "blocked: symbol not in allowlist"

    # B) Soft gates
    max_orders_per_day = _cfg_int(cfg, "max_orders_per_day", "daily_order_cap", default=10)
    cooldown_seconds = _cfg_int(cfg, "cooldown_seconds", "order_cooldown_seconds", default=30)

    if _orders_today >= max_orders_per_day:
        return [], "soft_block: max orders per day reached"

    now = _now()
    if _last_order_epoch and (now - _last_order_epoch) < cooldown_seconds:
        return [], "soft_block: cooldown"

    remaining = max(0, max_orders_per_day - _orders_today)
    if remaining <= 0:
        return [], "soft_block: no remaining order budget"

    if len(cleaned) > remaining:
        cleaned = cleaned[:remaining]

    return cleaned, None


def _record_orders_placed(n: int) -> None:
    global _orders_today, _last_order_epoch
    if n <= 0:
        return
    _orders_today += int(n)
    _last_order_epoch = _now()


def _attach_event_id(events: List[Dict[str, Any]], event_id: str) -> None:
    for e in events:
        if isinstance(e, dict) and not e.get("event_id"):
            e["event_id"] = event_id


def main(*, max_loops: Optional[int] = None, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    base_url = os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000")
    print(
        f"[runner] starting | base={base_url} | bot_id={BOT_ID} | loop={LOOP_SECONDS}s "
        f"| respect_market_hours={RESPECT_MARKET_HOURS}"
    )

    loops = 0

    with UStockAPI(base_url=base_url, timeout=15) as api:
        while True:
            if max_loops is not None and loops >= int(max_loops):
                return
            loops += 1

            t0 = time.time()
            mode = "paper"

            try:
                status = _get_status(api, BOT_ID)

                user_id = str(status.get("user_id") or "").strip()
                intent = str(status.get("intent") or "paused").strip().lower()
                status_mode = _normalize_mode(status.get("mode") or "paper")

                if intent != "running":
                    now = _now()
                    sig = f"paused|{status_mode}|intent_paused"
                    if _should_heartbeat(sig, now=now):
                        _safe_heartbeat(
                            api,
                            bot_id=BOT_ID,
                            intent="paused",
                            effective_state="paused",
                            mode=status_mode,
                            reason_code="intent_paused",
                            message="Paused by user.",
                            last_error=None,
                            last_tick=now,
                        )
                    _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)
                    continue

                mode, cfg = _extract_mode_cfg(status)

                # ✅ Market gate (skippable for testing)
                if RESPECT_MARKET_HOURS:
                    sess = _market_session(api)
                    is_open = bool(sess.get("is_open")) if sess.get("ok") else True  # fail-open locally
                    if not is_open:
                        paused_reason = str(sess.get("reason") or "Market closed")
                        next_open = sess.get("next_open")
                        next_open_epoch = int(next_open) if isinstance(next_open, (int, float)) else None

                        now = _now()
                        sig = f"wait_market|{mode}|market_closed|{next_open_epoch}"
                        if _should_heartbeat(sig, now=now):
                            _safe_heartbeat(
                                api,
                                bot_id=BOT_ID,
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
                        _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)
                        continue

                # ✅ Create ONE decision-scoped event_id per loop
                decision_event_id = _new_event_id()

                # ----------------
                # STRATEGY (generic)
                # ----------------
                result = _compute_intents_for_bot(api, BOT_ID, cfg)
                intents = [x for x in (result.get("intents") or []) if isinstance(x, dict)]
                strat_events = [x for x in (result.get("events") or []) if isinstance(x, dict)]
                _attach_event_id(strat_events, decision_event_id)

                # ----------------
                # Risk + safety gates
                # ----------------
                gated_intents, gate_reason = _filter_intents_with_gates(mode=mode, cfg=cfg, intents=intents, status=status)

                # Always report what strategy wanted (even if gated)
                _submit_intents(api, BOT_ID, intents)

                if not gated_intents:
                    combined: List[Dict[str, Any]] = []
                    combined.extend(strat_events)

                    if gate_reason:
                        combined.append(
                            {
                                "ts": _now_iso(),
                                "event_type": "risk_gate_block",
                                "level": "info",
                                "symbol": None,
                                "event_id": decision_event_id,
                                "payload": {"mode": mode, "reason": gate_reason, "bot_id": BOT_ID},
                            }
                        )

                    _attach_event_id(combined, decision_event_id)

                    if user_id:
                        upload_transaction_events(user_id, BOT_ID, mode, combined)

                    now = _now()
                    sig = f"running|{mode}|gated|{gate_reason}"
                    if _should_heartbeat(sig, now=now):
                        _safe_heartbeat(
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
                    _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)
                    continue

                # ----------------
                # EXECUTION
                # ----------------
                engine = BotEngine(mode=mode)
                tx_events = engine.execute_intents(gated_intents)
                _attach_event_id(tx_events, decision_event_id)

                placed = 0
                for e in tx_events:
                    if isinstance(e, dict) and str(e.get("event_type") or "").lower() == "order_submitted":
                        placed += 1
                _record_orders_placed(placed)

                # ----------------
                # SUPABASE (tx-only)
                # ----------------
                combined: List[Dict[str, Any]] = []
                combined.extend(strat_events)
                combined.extend(tx_events)
                _attach_event_id(combined, decision_event_id)

                if user_id:
                    upload_transaction_events(user_id, BOT_ID, mode, combined)
                    try:
                        _sync_trade_fills(api, user_id=user_id, bot_id=BOT_ID, mode=mode)
                    except Exception:
                        pass

                now = _now()
                sig = f"running|{mode}|loop_ok"
                if _should_heartbeat(sig, now=now):
                    _safe_heartbeat(
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

            except Exception as e:
                now = _now()
                sig = f"error|{mode}|runner_exception|{type(e).__name__}"
                if _should_heartbeat(sig, now=now):
                    _safe_heartbeat(
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
