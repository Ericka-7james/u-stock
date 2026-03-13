# u-stock-bots/runner/tests/test_engine.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import pytest

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


def test_execute_intents_returns_empty_list_when_no_intents():
    eng = BotEngine(mode="paper")
    assert eng.execute_intents([]) == []
    assert eng.execute_intents(None) == []  # type: ignore[arg-type]


def test_execute_intents_skips_non_dict_entries(monkeypatch):
    # Keep this test decoupled from TradeIntent schema.
    monkeypatch.setattr(eng_mod, "_intent_from_dict", lambda d: FakeIntent(symbol=d["symbol"]))

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    out = eng.execute_intents([None, "x", 123, ["a"], {"symbol": "AAPL", "side": "buy", "qty": 1}])

    assert len(out) == 1
    assert out[0]["event_type"] == "order_submitted"
    assert out[0]["symbol"] == "AAPL"


@pytest.mark.parametrize(
    "raw",
    [
        {},  # missing everything
        {"symbol": "AAPL"},  # missing side/qty
        {"symbol": "AAPL", "side": "hold", "qty": 1},  # invalid side
        {"symbol": "AAPL", "side": "buy", "qty": 0},  # invalid qty
        {"symbol": "AAPL", "side": "buy", "qty": ""},  # invalid qty
        {"symbol": "   ", "side": "buy", "qty": 1},  # invalid symbol (blank)
    ],
)
def test_execute_intents_emits_invalid_intent_event_for_missing_required_fields(raw):
    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    out = eng.execute_intents([raw])

    assert len(out) == 1
    evt = out[0]
    assert evt["event_type"] == "order_failed"
    assert evt["level"] == "error"
    assert evt["payload"]["error"] == "invalid_intent"
    assert "Missing/invalid required fields" in evt["payload"]["detail"]


def test_execute_intents_normalizes_symbol_uppercase(monkeypatch):
    monkeypatch.setattr(eng_mod, "_intent_from_dict", lambda d: FakeIntent(symbol=d["symbol"]))

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    out = eng.execute_intents([{"symbol": " aapl ", "side": "buy", "qty": 1}])

    assert len(out) == 1
    assert out[0]["event_type"] == "order_submitted"
    assert out[0]["symbol"] == "AAPL"


def test_execute_intents_emits_error_event_on_tradeintent_conversion_failure(monkeypatch):
    def boom(_: Dict[str, Any]):
        raise ValueError("bad shape")

    monkeypatch.setattr(eng_mod, "_intent_from_dict", boom)

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    # Must pass basic sanity checks first (symbol/side/qty), then conversion fails.
    out = eng.execute_intents([{"symbol": "AAPL", "side": "buy", "qty": 1}])

    assert len(out) == 1
    evt = out[0]
    assert evt["event_type"] == "order_failed"
    assert evt["level"] == "error"
    assert evt["symbol"] == "AAPL"
    assert evt["payload"]["error"] == "invalid_tradeintent_shape"
    assert "bad shape" in evt["payload"]["detail"]


def test_execute_intents_emits_error_event_on_executor_exception(monkeypatch):
    monkeypatch.setattr(eng_mod, "_intent_from_dict", lambda d: FakeIntent(symbol=d["symbol"]))

    class BoomExecutor:
        def place_bracket(self, intent):
            raise RuntimeError("broker down")

    eng = BotEngine(mode="paper")
    eng.executor = BoomExecutor()

    out = eng.execute_intents([{"symbol": "TSLA", "side": "buy", "qty": 1}])

    assert len(out) == 1
    evt = out[0]
    assert evt["event_type"] == "order_failed"
    assert evt["level"] == "error"
    assert evt["symbol"] == "TSLA"
    assert evt["payload"]["error"] == "executor_exception"
    assert "broker down" in evt["payload"]["detail"]


def test_execute_intents_caps_max_intents_and_emits_cap_event(monkeypatch):
    # Ensure deterministic cap
    monkeypatch.setattr(eng_mod, "_env_int", lambda name, default: 2)

    monkeypatch.setattr(eng_mod, "_intent_from_dict", lambda d: FakeIntent(symbol=d["symbol"]))

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    intents = [
        {"symbol": "AAPL", "side": "buy", "qty": 1},
        {"symbol": "TSLA", "side": "buy", "qty": 1},
        {"symbol": "MSFT", "side": "buy", "qty": 1},
    ]

    out = eng.execute_intents(intents)

    # 2 orders executed + 1 cap warning event
    assert len(out) == 3
    assert out[0]["event_type"] == "order_submitted"
    assert out[1]["event_type"] == "order_submitted"

    cap_evt = out[2]
    assert cap_evt["event_type"] == "order_failed"
    assert cap_evt["payload"]["error"] == "execution_cap_exceeded"
    assert "capped execution" in cap_evt["payload"]["detail"]