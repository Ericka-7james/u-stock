# u-stock-bots/runner/engine.py
from __future__ import annotations

import os
import time
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Optional, Protocol, Tuple

from bots._shared.types import TradeIntent

# your existing execution result + protocol
from bots.execution.base import OrderResult

# your placeholder executor (can expand later)
from bots.execution.tradestation import TradeStationExecutor


class ExecutorLike(Protocol):
    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        ...


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _normalize_mode(raw: Any) -> str:
    m = str(raw or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def _intent_from_dict(d: Dict[str, Any]) -> TradeIntent:
    """
    Convert JSON dict -> TradeIntent dataclass.

    This assumes your intent dict keys match TradeIntent fields.
    If you later add/remove fields, keep this as the canonical conversion point.
    """
    return TradeIntent(**d)


def _result_to_event(
    *,
    bot_mode: str,
    intent: TradeIntent,
    result: OrderResult,
) -> Dict[str, Any]:
    status = str(result.status or "").strip().lower()
    symbol = getattr(intent, "symbol", None)

    # Map executor result -> transaction event type
    if status in ("submitted", "accepted", "ok"):
        evt_type = "order_submitted"
        level = "info"
    elif status in ("rejected",):
        evt_type = "order_rejected"
        level = "error"
    elif status in ("canceled", "cancelled"):
        evt_type = "order_canceled"
        level = "info"
    else:
        evt_type = "order_failed"
        level = "error"

    return {
        "ts": _now_iso(),
        "event_type": evt_type,
        "level": level,
        "symbol": str(symbol).upper().strip() if symbol else None,
        "payload": {
            "mode": bot_mode,
            "status": status,
            "order_id": result.order_id,
            "message": result.message,
            "intent": asdict(intent) if is_dataclass(intent) else dict(getattr(intent, "__dict__", {})),
        },
    }


class BotEngine:
    """
    Execution engine for one runner instance.

    - mode: 'paper' or 'live'
    - executor_name: which broker/executor adapter to use
    """

    def __init__(self, *, mode: str, executor_name: Optional[str] = None):
        self.mode = _normalize_mode(mode)
        self.executor_name = (executor_name or os.getenv("RUNNER_EXECUTOR") or "tradestation").strip().lower()
        self.executor = self._build_executor()

    def _build_executor(self) -> ExecutorLike:
        """
        Today: TradeStationExecutor placeholder.
        Tomorrow: add AlpacaExecutor, IBKRExecutor, etc.
        """
        # You can enforce "no live without creds" here later if needed.
        # For now, we allow mode=live but executor may still be sim until wired.
        if self.executor_name in ("tradestation", "ts"):
            return TradeStationExecutor()

        # Default fallback
        return TradeStationExecutor()

    def execute_intents(self, intents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Convert intents -> place orders -> return transaction events.

        IMPORTANT:
          - If you want strategy-only runs, just don't call this.
          - This does NOT spam Supabase; it only returns tx-like events.
        """
        if not intents:
            return []

        out: List[Dict[str, Any]] = []

        for raw in intents:
            if not isinstance(raw, dict):
                continue

            try:
                intent = _intent_from_dict(raw)
            except Exception as e:
                out.append(
                    {
                        "ts": _now_iso(),
                        "event_type": "order_failed",
                        "level": "error",
                        "symbol": str(raw.get("symbol") or "").upper().strip() if isinstance(raw, dict) else None,
                        "payload": {"mode": self.mode, "error": "Invalid TradeIntent shape", "detail": repr(e), "raw": raw},
                    }
                )
                continue

            try:
                result = self.executor.place_bracket(intent)
                out.append(_result_to_event(bot_mode=self.mode, intent=intent, result=result))
            except Exception as e:
                out.append(
                    {
                        "ts": _now_iso(),
                        "event_type": "order_failed",
                        "level": "error",
                        "symbol": str(getattr(intent, "symbol", "")).upper().strip() or None,
                        "payload": {"mode": self.mode, "error": repr(e), "intent": asdict(intent) if is_dataclass(intent) else raw},
                    }
                )

        return out
