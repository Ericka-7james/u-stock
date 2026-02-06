from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import runner.engine as eng_mod
from runner.engine import BotEngine


class FakeOrderResult:
    def __init__(self, status: str = "submitted", order_id: str = "OID", message: str = "ok"):
        self.status = status
        self.order_id = order_id
        self.message = message


class FakeExecutor:
    def __init__(self):
        self.calls: List[Any] = []

    def place_bracket(self, intent):
        self.calls.append(intent)
        return FakeOrderResult(status="submitted")


@dataclass
class FakeIntent:
    symbol: str


def test_engine_uses_paper_executor_when_mode_paper():
    eng = BotEngine(mode="paper")
    assert eng.executor.__class__.__name__ == "PaperExecutor"


def test_engine_uses_tradestation_when_mode_live():
    eng = BotEngine(mode="live")
    assert eng.executor.__class__.__name__ == "TradeStationExecutor"


def test_execute_intents_skips_non_dict_entries(monkeypatch):
    # Patch intent conversion so this test isn't coupled to TradeIntent's full schema
    monkeypatch.setattr(eng_mod, "_intent_from_dict", lambda d: FakeIntent(symbol=d["symbol"]))

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    out = eng.execute_intents([None, "x", 123, ["a"], {"symbol": "AAPL", "side": "buy", "qty": 1}])

    assert len(out) == 1
    assert out[0]["event_type"] == "order_submitted"
    assert out[0]["symbol"] == "AAPL"


def test_execute_intents_emits_error_event_on_bad_intent_shape(monkeypatch):
    # Force conversion failure
    def boom(_: Dict[str, Any]):
        raise ValueError("bad shape")

    monkeypatch.setattr(eng_mod, "_intent_from_dict", boom)

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    out = eng.execute_intents([{"symbol": "AAPL"}])
    assert len(out) == 1
    assert out[0]["event_type"] == "order_failed"
    assert out[0]["level"] == "error"
    assert out[0]["symbol"] == "AAPL"


def test_execute_intents_emits_error_event_on_executor_exception(monkeypatch):
    monkeypatch.setattr(eng_mod, "_intent_from_dict", lambda d: FakeIntent(symbol=d["symbol"]))

    class BoomExecutor:
        def place_bracket(self, intent):
            raise RuntimeError("broker down")

    eng = BotEngine(mode="paper")
    eng.executor = BoomExecutor()

    out = eng.execute_intents([{"symbol": "TSLA", "side": "buy", "qty": 1}])
    assert len(out) == 1
    assert out[0]["event_type"] == "order_failed"
    assert out[0]["symbol"] == "TSLA"
    assert "broker down" in out[0]["payload"]["error"]
