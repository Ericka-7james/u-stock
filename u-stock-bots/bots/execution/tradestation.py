from bots.execution.base import OrderResult
from bots._shared.types import TradeIntent

class TradeStationExecutor:
    def place_bracket(self, intent: TradeIntent) -> OrderResult:
        # Placeholder until API credentials wired
        return OrderResult(
            status="submitted",
            order_id="SIM_TS_ORDER",
            message=f"Paper order submitted for {intent.symbol}"
        )
