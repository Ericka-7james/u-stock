# u-stock-bots/runner/tests/test_engine.py
from __future__ import annotations

import runner.engine as engine
from runner.engine import BotEngine


class FakeResult:
    def __init__(self, status: str, order_id: str = "oid", message: str = "msg"):
        self.status = status
        self.order_id = order_id
        self.message = message


class FakeExecutor:
    def __init__(self):
        self.calls = []

    def place_bracket(self, intent):
        self.calls.append(intent)
        return FakeResult(status="submitted", order_id="abc123", message="ok")


class ExplodingExecutor:
    def place_bracket(self, intent):
        raise RuntimeError("executor boom")


class FakeTradeIntent:
    # minimal "dataclass-like" shape is not needed because engine._intent_from_dict is the canonical conversion
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_engine_uses_paper_executor_when_mode_paper():
    eng = BotEngine(mode="paper")
    assert eng.executor.__class__.__name__ == "PaperExecutor"


def test_engine_uses_tradestation_when_mode_live_default():
    eng = BotEngine(mode="live")
    assert eng.executor.__class__.__name__ == "TradeStationExecutor"


def test_engine_normalizes_mode_unknown_to_paper():
    eng = BotEngine(mode="weird")
    assert eng.mode == "paper"
    assert eng.executor.__class__.__name__ == "PaperExecutor"


def test_engine_live_executor_falls_back_to_tradestation_for_unknown_executor_name():
    eng = BotEngine(mode="live", executor_name="something_else")
    assert eng.executor.__class__.__name__ == "TradeStationExecutor"


def test_execute_intents_returns_empty_for_empty_list():
    eng = BotEngine(mode="paper")
    assert eng.execute_intents([]) == []


def test_execute_intents_skips_non_dict_entries():
    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    out = eng.execute_intents([None, "x", 123, ["a"], {"symbol": "AAPL", "side": "buy", "qty": 1}])

    # only one valid dict should have been attempted
    assert len(out) == 1
    assert out[0]["event_type"] == "order_submitted"
    assert out[0]["symbol"] == "AAPL"


def test_execute_intents_emits_order_submitted_on_submitted_status(monkeypatch):
    # Make timestamps deterministic
    monkeypatch.setattr(engine, "_now_iso", lambda: "2026-01-01T00:00:00Z")
    # Make TradeIntent conversion deterministic and not depend on bots._shared.types.TradeIntent internals
    monkeypatch.setattr(engine, "_intent_from_dict", lambda d: FakeTradeIntent(**d))

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()

    intents = [{"symbol": "aapl", "side": "buy", "qty": 1}]
    out = eng.execute_intents(intents)

    assert len(out) == 1
    evt = out[0]
    assert evt["ts"] == "2026-01-01T00:00:00Z"
    assert evt["event_type"] == "order_submitted"
    assert evt["level"] == "info"
    assert evt["symbol"] == "AAPL"
    assert evt["payload"]["mode"] == "paper"
    assert evt["payload"]["status"] == "submitted"
    assert evt["payload"]["order_id"] == "abc123"
    assert evt["payload"]["message"] == "ok"
    assert evt["payload"]["intent"]["symbol"] == "aapl"


def test_execute_intents_maps_rejected_to_order_rejected(monkeypatch):
    monkeypatch.setattr(engine, "_now_iso", lambda: "T")
    monkeypatch.setattr(engine, "_intent_from_dict", lambda d: FakeTradeIntent(**d))

    class RejectingExecutor:
        def place_bracket(self, intent):
            return FakeResult(status="rejected", order_id="r1", message="nope")

    eng = BotEngine(mode="paper")
    eng.executor = RejectingExecutor()

    out = eng.execute_intents([{"symbol": "MSFT", "side": "buy", "qty": 1}])

    assert len(out) == 1
    evt = out[0]
    assert evt["event_type"] == "order_rejected"
    assert evt["level"] == "error"
    assert evt["symbol"] == "MSFT"
    assert evt["payload"]["status"] == "rejected"


def test_execute_intents_maps_canceled_and_cancelled_to_order_canceled(monkeypatch):
    monkeypatch.setattr(engine, "_now_iso", lambda: "T")
    monkeypatch.setattr(engine, "_intent_from_dict", lambda d: FakeTradeIntent(**d))

    class CancelingExecutor:
        def __init__(self, status):
            self.status = status

        def place_bracket(self, intent):
            return FakeResult(status=self.status, order_id="c1", message="bye")

    for status in ("canceled", "cancelled"):
        eng = BotEngine(mode="paper")
        eng.executor = CancelingExecutor(status)

        out = eng.execute_intents([{"symbol": "TSLA", "side": "sell", "qty": 2}])

        assert len(out) == 1
        evt = out[0]
        assert evt["event_type"] == "order_canceled"
        assert evt["level"] == "info"
        assert evt["payload"]["status"] == status


def test_execute_intents_maps_not_implemented_to_order_failed(monkeypatch):
    monkeypatch.setattr(engine, "_now_iso", lambda: "T")
    monkeypatch.setattr(engine, "_intent_from_dict", lambda d: FakeTradeIntent(**d))

    class NIExecutor:
        def place_bracket(self, intent):
            return FakeResult(status="not_implemented", order_id=None, message="todo")

    eng = BotEngine(mode="paper")
    eng.executor = NIExecutor()

    out = eng.execute_intents([{"symbol": "NVDA", "side": "buy", "qty": 1}])

    assert len(out) == 1
    evt = out[0]
    assert evt["event_type"] == "order_failed"
    assert evt["level"] == "error"
    assert evt["payload"]["status"] == "not_implemented"


def test_execute_intents_emits_order_failed_when_tradeintent_shape_invalid(monkeypatch):
    monkeypatch.setattr(engine, "_now_iso", lambda: "T")

    def bad_intent(_d):
        raise TypeError("missing fields")

    monkeypatch.setattr(engine, "_intent_from_dict", bad_intent)

    eng = BotEngine(mode="paper")
    eng.executor = FakeExecutor()  # should never be called due to conversion failure

    raw = {"symbol": "AAPL"}  # intentionally incomplete
    out = eng.execute_intents([raw])

    assert len(out) == 1
    evt = out[0]
    assert evt["event_type"] == "order_failed"
    assert evt["level"] == "error"
    assert evt["symbol"] == "AAPL"
    assert evt["payload"]["mode"] == "paper"
    assert evt["payload"]["error"] == "Invalid TradeIntent shape"
    assert "missing fields" in evt["payload"]["detail"]
    assert evt["payload"]["raw"] == raw


def test_execute_intents_emits_order_failed_when_executor_raises(monkeypatch):
    monkeypatch.setattr(engine, "_now_iso", lambda: "T")
    monkeypatch.setattr(engine, "_intent_from_dict", lambda d: FakeTradeIntent(**d))

    eng = BotEngine(mode="paper")
    eng.executor = ExplodingExecutor()

    out = eng.execute_intents([{"symbol": "AAPL", "side": "buy", "qty": 1}])

    assert len(out) == 1
    evt = out[0]
    assert evt["event_type"] == "order_failed"
    assert evt["level"] == "error"
    assert evt["symbol"] == "AAPL"
    assert evt["payload"]["mode"] == "paper"
    assert "executor boom" in evt["payload"]["error"]
    assert evt["payload"]["intent"]["symbol"] == "AAPL"
