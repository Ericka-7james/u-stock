# u-stock-bots/bots/execution/paper.py
from __future__ import annotations

import hashlib

from bots.execution.base import OrderResult
from bots._shared.types import TradeIntent


def _normalize_symbol(sym: str) -> str:
    s = (sym or "").upper().strip()
    # keep it simple: alnum + . - _
    s2 = "".join(ch for ch in s if ch.isalnum() or ch in {".", "-", "_"})
    return s2


def _intent_fingerprint(intent: TradeIntent) -> str:
    """
    Create a deterministic short fingerprint for de-dup + log correlation.
    """
    payload = "|".join(
        [
            _normalize_symbol(getattr(intent, "symbol", "") or ""),
            str(getattr(intent, "side", "") or "").lower(),
            f"{float(getattr(intent, 'entry', 0.0)):0.6f}",
            f"{float(getattr(intent, 'stop', 0.0)):0.6f}",
            f"{float(getattr(intent, 'take_profit', 0.0)):0.6f}",
            str(getattr(intent, "bot_id", "") or ""),
            str(getattr(intent, "timeframe", "") or ""),
        ]
    ).encode("utf-8")

    return hashlib.sha1(payload).hexdigest()[:10]


class PaperExecutor:
    """
    Paper executor: never calls an external broker.

    Production-ready tweaks:
      - validates symbol
      - produces deterministic order_id fingerprint to avoid collisions
    """

    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        sym = _normalize_symbol(getattr(intent, "symbol", "") or "")
        if not sym:
            return OrderResult(status="rejected", order_id=None, message="Missing/invalid symbol")

        fp = _intent_fingerprint(intent)
        return OrderResult(
            status="submitted",
            order_id=f"SIM_PAPER_{sym}_{fp}",
            message=f"Paper bracket submitted for {sym}",
        )
