# u-stock-bots/bots/execution/paper.py
from __future__ import annotations

from bots.execution.base import OrderResult
from bots._shared.types import TradeIntent


class PaperExecutor:
    """
    Paper executor: never calls an external broker.
    Produces deterministic-ish IDs for tracking in logs.
    """

    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        sym = (intent.symbol or "").upper().strip()
        return OrderResult(
            status="submitted",
            order_id=f"SIM_PAPER_{sym}",
            message=f"Paper bracket submitted for {sym}",
        )
