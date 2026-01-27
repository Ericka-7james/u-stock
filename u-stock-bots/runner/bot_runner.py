# u-stock-bots/runner/bot_runner.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Tuple, Callable

from bots._shared.ustock_http import UStockAPI
from runner.engine import BotEngine
from runner.supabase import upload_transaction_events

LOOP_SECONDS = int(os.getenv("RUNNER_LOOP_SECONDS", "5"))
BOT_ID = os.getenv("RUNNER_BOT_ID", "ema_trend")


def _now() -> int:
    return int(time.time())


def _sleep_smart(seconds: float, *, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    sleep_fn(max(0.2, float(seconds)))


def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _extract_mode_cfg(status: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    cfg = (status.get("config") or {}) if isinstance(status.get("config"), dict) else {}
    mode = _normalize_mode(status.get("mode") or cfg.get("mode") or "paper")
    return mode, cfg


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


# ----------------------------------------------------------
# Bot compatibility adapter (multiple bot API shapes)
# ----------------------------------------------------------
def _compute_intents_for_ema_trend(api: UStockAPI, cfg: Dict[str, Any]) -> Dict[str, Any]:
    from bots.ema_trend import bot as ema_bot  # type: ignore

    # A) Preferred: generate_output(api, config) -> {"intents":[...], "events":[...]}
    gen_out = getattr(ema_bot, "generate_output", None)
    if callable(gen_out):
        out = gen_out(api=api, config=cfg)
        if isinstance(out, dict):
            intents = out.get("intents") or []
            events = out.get("events") or []
            return {
                "intents": intents if isinstance(intents, list) else [],
                "events": events if isinstance(events, list) else [],
            }

    # B) generate_intents(api, config) -> [dict...]
    gen_intents = getattr(ema_bot, "generate_intents", None)
    if callable(gen_intents):
        intents = gen_intents(api=api, config=cfg)
        return {"intents": intents if isinstance(intents, list) else [], "events": []}

    # C) legacy run(api=..., cfg=dataclass) -> [TradeIntent...]
    try:
        from dataclasses import asdict, is_dataclass
        from bots.ema_trend.config import EMATrendConfig  # type: ignore

        bot_cfg = EMATrendConfig()
        if isinstance(cfg, dict):
            for k, v in cfg.items():
                if hasattr(bot_cfg, k):
                    try:
                        setattr(bot_cfg, k, v)
                    except Exception:
                        pass

        intents_raw = ema_bot.run(api=api, cfg=bot_cfg) or []
        intents_out: List[Dict[str, Any]] = []
        for it in intents_raw:
            if isinstance(it, dict):
                intents_out.append(it)
            elif is_dataclass(it):
                intents_out.append(asdict(it))
            else:
                intents_out.append(dict(getattr(it, "__dict__", {})))
        return {"intents": intents_out, "events": []}
    except Exception:
        return {"intents": [], "events": []}


def main(*, max_loops: Optional[int] = None, sleep_fn: Callable[[float], None] = time.sleep) -> None:
    """
    max_loops: for tests; if None, runs forever.
    sleep_fn: injectable for tests.
    """
    base_url = os.getenv("USTOCK_API_BASE", "http://127.0.0.1:8000")
    print(f"[runner] starting | base={base_url} | bot_id={BOT_ID} | loop={LOOP_SECONDS}s")

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

                # NEW contract: intent drives whether runner should operate
                intent = str(status.get("intent") or "paused").strip().lower()
                effective_state = str(status.get("effective_state") or "stopped").strip().lower()

                if intent != "running":
                    # If user paused it, report paused occasionally but don't spam
                    _safe_heartbeat(
                        api,
                        bot_id=BOT_ID,
                        intent="paused",
                        effective_state="paused",
                        mode=_normalize_mode(status.get("mode") or "paper"),
                        reason_code="intent_paused",
                        message="Paused by user.",
                        last_error=None,
                    )
                    _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)
                    continue

                mode, cfg = _extract_mode_cfg(status)

                # market gate
                sess = _market_session(api)
                is_open = bool(sess.get("is_open")) if sess.get("ok") else True  # fail-open locally
                if not is_open:
                    paused_reason = str(sess.get("reason") or "Market closed")
                    next_open = sess.get("next_open")
                    next_open_epoch = int(next_open) if isinstance(next_open, (int, float)) else None

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
                    )
                    _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)
                    continue

                # ----------------
                # STRATEGY
                # ----------------
                result = _compute_intents_for_ema_trend(api, cfg)
                intents = [x for x in (result.get("intents") or []) if isinstance(x, dict)]
                strat_events = [x for x in (result.get("events") or []) if isinstance(x, dict)]

                _submit_intents(api, BOT_ID, intents)

                # ----------------
                # EXECUTION (routed by mode)
                # ----------------
                engine = BotEngine(mode=mode)
                tx_events = engine.execute_intents(intents)

                # ----------------
                # SUPABASE (tx-only)
                # ----------------
                combined: List[Dict[str, Any]] = []
                combined.extend(strat_events)
                combined.extend(tx_events)

                upload_transaction_events(BOT_ID, mode, combined)

                _safe_heartbeat(
                    api,
                    bot_id=BOT_ID,
                    intent="running",
                    effective_state="running",
                    mode=mode,
                    reason_code="loop_ok",
                    message="Loop active.",
                    last_error=None,
                    last_tick=_now(),
                )

            except Exception as e:
                _safe_heartbeat(
                    api,
                    bot_id=BOT_ID,
                    intent="running",
                    effective_state="error",
                    mode=mode,
                    reason_code="runner_exception",
                    message="Runner exception.",
                    last_error=repr(e),
                )

            _sleep_smart(LOOP_SECONDS - (time.time() - t0), sleep_fn=sleep_fn)


if __name__ == "__main__":
    main()
