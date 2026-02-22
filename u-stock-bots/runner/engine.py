# u-stock-bots/runner/engine.py
from __future__ import annotations

import os
import time
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Optional, Protocol, Tuple

from bots._shared.types import TradeIntent

from bots.execution.base import OrderResult
from bots.execution.paper import PaperExecutor
from bots.execution.tradestation import TradeStationExecutor


class ExecutorLike(Protocol):
    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        ...


# --------------------------------------------
# Helpers
# --------------------------------------------
def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _now_epoch() -> int:
    return int(time.time())


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name, "")
    if raw == "":
        return int(default)
    try:
        return int(raw)
    except Exception:
        return int(default)


def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _safe_symbol(x: Any) -> Optional[str]:
    s = str(x or "").strip().upper()
    return s or None


def _intent_preview(intent: TradeIntent) -> Dict[str, Any]:
    if is_dataclass(intent):
        return asdict(intent)
    # fallback (should rarely happen)
    return dict(getattr(intent, "__dict__", {}))


def _intent_from_dict(d: Dict[str, Any]) -> TradeIntent:
    """
    Canonical conversion point: JSON dict -> TradeIntent dataclass.
    Any intent-shape problems should be caught at this boundary.
    """
    return TradeIntent(**d)


def _executor_name_for_event(executor_name: str) -> str:
    # keep consistent labels in event payloads
    n = str(executor_name or "").strip().lower()
    if n in {"ts", "tradestation"}:
        return "tradestation"
    if n in {"paper"}:
        return "paper"
    return n or "unknown"


def _result_to_event(
    *,
    bot_mode: str,
    executor_name: str,
    intent: TradeIntent,
    result: OrderResult,
    latency_ms: int,
) -> Dict[str, Any]:
    """
    Normalize broker results into runner events.
    """
    status = str(getattr(result, "status", "") or "").strip().lower()
    symbol = _safe_symbol(getattr(intent, "symbol", None))

    if status in ("submitted", "accepted", "ok"):
        evt_type = "order_submitted"
        level = "info"
    elif status in ("rejected",):
        evt_type = "order_rejected"
        level = "error"
    elif status in ("canceled", "cancelled"):
        evt_type = "order_canceled"
        level = "info"
    elif status in ("not_implemented",):
        evt_type = "order_failed"
        level = "error"
    else:
        evt_type = "order_failed"
        level = "error"

    return {
        "ts": _now_iso(),
        "event_type": evt_type,
        "level": level,
        "symbol": symbol,
        "payload": {
            "mode": bot_mode,
            "executor": _executor_name_for_event(executor_name),
            "status": status,
            "latency_ms": int(latency_ms),
            "order_id": getattr(result, "order_id", None),
            "message": getattr(result, "message", None),
            "intent": _intent_preview(intent),
        },
    }


def _failed_intent_event(*, mode: str, executor_name: str, raw: Dict[str, Any], reason: str, detail: str) -> Dict[str, Any]:
    return {
        "ts": _now_iso(),
        "event_type": "order_failed",
        "level": "error",
        "symbol": _safe_symbol(raw.get("symbol")),
        "payload": {
            "mode": mode,
            "executor": _executor_name_for_event(executor_name),
            "error": reason,
            "detail": detail,
            "raw": raw,
        },
    }


def _executor_exception_event(
    *,
    mode: str,
    executor_name: str,
    intent: TradeIntent,
    err: Exception,
    latency_ms: int,
) -> Dict[str, Any]:
    return {
        "ts": _now_iso(),
        "event_type": "order_failed",
        "level": "error",
        "symbol": _safe_symbol(getattr(intent, "symbol", None)),
        "payload": {
            "mode": mode,
            "executor": _executor_name_for_event(executor_name),
            "error": "executor_exception",
            "detail": repr(err),
            "latency_ms": int(latency_ms),
            "intent": _intent_preview(intent),
        },
    }


# --------------------------------------------
# Engine
# --------------------------------------------
class BotEngine:
    """
    Execution engine for one runner instance.

    Production rules:
      - mode='paper' ALWAYS uses PaperExecutor (so we can't accidentally place live orders)
      - mode='live' chooses broker adapter (RUNNER_EXECUTOR), defaulting to tradestation
      - never throws: any failure becomes an order_failed event
    """

    def __init__(self, *, mode: str, executor_name: Optional[str] = None):
        self.mode = _normalize_mode(mode)

        # Important safety default: if live, we still default to tradestation adapter,
        # but paper mode ignores this and uses PaperExecutor no matter what.
        self.executor_name = (executor_name or _env("RUNNER_EXECUTOR", "tradestation")).strip().lower()

        # Optional guardrails
        self.max_intents_per_tick = _env_int("RUNNER_MAX_EXEC_INTENTS_PER_TICK", 25)

        self.executor = self._build_executor()

    def _build_executor(self) -> ExecutorLike:
        # Hard safety rail: paper mode cannot be overridden to live broker.
        if self.mode == "paper":
            return PaperExecutor()

        # live mode:
        if self.executor_name in ("tradestation", "ts"):
            return TradeStationExecutor()

        # If an unknown executor is configured, fail closed into TradeStationExecutor stub
        # (you can add more adapters later and explicitly map them here).
        return TradeStationExecutor()

    def execute_intents(self, intents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Convert intents -> place orders -> return transaction events.

        Notes:
          - Any invalid intent becomes an order_failed event.
          - Executor exceptions become order_failed events.
          - We cap max intents per tick to avoid runaway loops / duplicate placement storms.
        """
        if not intents:
            return []

        out: List[Dict[str, Any]] = []

        # Cap runaway execution per tick (defense-in-depth)
        max_n = max(1, int(self.max_intents_per_tick))
        work = intents[:max_n] if isinstance(intents, list) else []

        for raw in work:
            if not isinstance(raw, dict):
                continue

            # Basic sanity: required fields (TradeIntent will enforce too, but this gives clearer events)
            sym = _safe_symbol(raw.get("symbol"))
            side = str(raw.get("side") or "").strip().lower()
            qty = raw.get("qty")

            if not sym or side not in {"buy", "sell"} or qty in (None, "", 0, 0.0):
                out.append(
                    _failed_intent_event(
                        mode=self.mode,
                        executor_name=self.executor_name,
                        raw=raw,
                        reason="invalid_intent",
                        detail="Missing/invalid required fields: symbol, side (buy|sell), qty.",
                    )
                )
                continue

            # Normalize symbol in the raw dict so TradeIntent gets clean input
            raw["symbol"] = sym

            try:
                intent = _intent_from_dict(raw)
            except Exception as e:
                out.append(
                    _failed_intent_event(
                        mode=self.mode,
                        executor_name=self.executor_name,
                        raw=raw,
                        reason="invalid_tradeintent_shape",
                        detail=repr(e),
                    )
                )
                continue

            t0 = time.time()
            try:
                result = self.executor.place_bracket(intent)
                latency_ms = int((time.time() - t0) * 1000)
                out.append(
                    _result_to_event(
                        bot_mode=self.mode,
                        executor_name=self.executor_name,
                        intent=intent,
                        result=result,
                        latency_ms=latency_ms,
                    )
                )
            except Exception as e:
                latency_ms = int((time.time() - t0) * 1000)
                out.append(
                    _executor_exception_event(
                        mode=self.mode,
                        executor_name=self.executor_name,
                        intent=intent,
                        err=e,
                        latency_ms=latency_ms,
                    )
                )

        # If caller passed more than max, emit a tiny signal so you can see it in logs (optional)
        if len(intents) > max_n:
            out.append(
                {
                    "ts": _now_iso(),
                    "event_type": "order_failed",
                    "level": "error",
                    "symbol": None,
                    "payload": {
                        "mode": self.mode,
                        "executor": _executor_name_for_event(self.executor_name),
                        "error": "execution_cap_exceeded",
                        "detail": f"Received {len(intents)} intents but capped execution at {max_n} per tick.",
                        "ts_epoch": _now_epoch(),
                    },
                }
            )

        return out