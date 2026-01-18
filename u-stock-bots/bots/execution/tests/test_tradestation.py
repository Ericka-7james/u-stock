from bots.execution.tradestation import TradeStationExecutor
from bots._shared.types import TradeIntent


def test_tradestation_executor_is_not_implemented():
    ex = TradeStationExecutor()
    intent = TradeIntent(
        symbol="AAPL",
        side="buy",
        entry=100.0,
        stop=99.5,
        take_profit=101.0,
        confidence=0.7,
        bot_id="ema_trend",
        timeframe="1Min",
        reason_codes=[],
    )

    r = ex.place_bracket(intent)
    assert r.status == "not_implemented"
    assert r.order_id is None
