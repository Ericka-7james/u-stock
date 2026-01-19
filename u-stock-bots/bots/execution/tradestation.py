# u-stock-bots/bots/execution/tradestation.py
from __future__ import annotations

from bots.execution.base import OrderResult
from bots._shared.types import TradeIntent


class TradeStationExecutor:
    """
    TradeStation executor (stub).

    Production safety:
      - returns not_implemented until credentials + API wiring exist
      - prevents "fake success" that could hide missing real execution
    """

    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        sym = (getattr(intent, "symbol", "") or "").upper().strip()
        return OrderResult(
            status="not_implemented",
            order_id=None,
            message=f"TradeStation execution not implemented yet (symbol={sym})",
        )
