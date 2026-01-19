from bots.execution.paper import PaperExecutor
from bots._shared.types import TradeIntent


def test_paper_executor_submits_with_deterministic_id():
    ex = PaperExecutor()
    intent = TradeIntent(
        symbol="aapl",
        side="buy",
        entry=100.0,
        stop=99.5,
        take_profit=101.0,
        confidence=0.7,
        bot_id="ema_trend",
        timeframe="1Min",
        reason_codes=["X"],
    )

    r1 = ex.place_bracket(intent)
    r2 = ex.place_bracket(intent)

    assert r1.status == "submitted"
    assert r1.order_id is not None
    assert r1.order_id == r2.order_id
    assert "SIM_PAPER_AAPL_" in r1.order_id


def test_paper_executor_rejects_blank_symbol():
    ex = PaperExecutor()
    intent = TradeIntent(
        symbol="   ",
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
    assert r.status == "rejected"
    assert r.order_id is None
