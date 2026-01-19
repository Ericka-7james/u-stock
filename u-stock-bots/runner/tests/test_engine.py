from runner.engine import BotEngine


def test_engine_uses_paper_executor_when_mode_paper():
    eng = BotEngine(mode="paper")
    assert eng.executor.__class__.__name__ == "PaperExecutor"


def test_engine_uses_tradestation_when_mode_live():
    eng = BotEngine(mode="live")
    assert eng.executor.__class__.__name__ == "TradeStationExecutor"
