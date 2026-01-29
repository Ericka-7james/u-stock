# u-stock-bots/runner/tests/test_api_client.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import runner.api_client as api_client


class FakeAPI:
    """
    Minimal stub for UStockAPI that records calls.
    """

    def __init__(self):
        self.get_calls: List[Tuple[str, Optional[Dict[str, Any]]]] = []
        self.post_calls: List[Tuple[str, Optional[Dict[str, Any]]]] = []

        # Optional behavior hooks
        self.get_return: Dict[str, Any] | None = None
        self.get_side_effect: Exception | None = None

    def get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        self.get_calls.append((path, params))
        if self.get_side_effect is not None:
            raise self.get_side_effect
        return self.get_return

    def post(self, path: str, json: Optional[Dict[str, Any]] = None) -> Any:
        self.post_calls.append((path, json))
        return {"ok": True}


def test_now_epoch_is_int_and_uses_time(monkeypatch):
    monkeypatch.setattr(api_client.time, "time", lambda: 1700000000.9)
    assert api_client.now_epoch() == 1700000000
    assert isinstance(api_client.now_epoch(), int)


def test_get_status_calls_correct_endpoint_and_params():
    api = FakeAPI()
    api.get_return = {"ok": True, "bot_id": "ema_trend"}

    out = api_client.get_status(api, "ema_trend")

    assert out == {"ok": True, "bot_id": "ema_trend"}
    assert api.get_calls == [
        ("/api/bots/status_runner", {"bot_id": "ema_trend"}),
    ]


def test_submit_intents_posts_payload_including_ts(monkeypatch):
    monkeypatch.setattr(api_client, "now_epoch", lambda: 123)
    api = FakeAPI()

    intents = [{"symbol": "AAPL", "side": "buy", "qty": 1}]
    api_client.submit_intents(api, "ema_trend", intents)

    assert len(api.post_calls) == 1
    path, payload = api.post_calls[0]
    assert path == "/api/bots/submit-intents"
    assert payload is not None
    assert payload["bot_id"] == "ema_trend"
    assert payload["ts"] == 123
    assert payload["items"] == intents


def test_market_session_returns_dict_when_ok():
    api = FakeAPI()
    api.get_return = {"ok": True, "is_open": False}

    out = api_client.market_session(api)

    assert out == {"ok": True, "is_open": False}
    assert api.get_calls == [
        ("/api/market/us/session", None),
    ]


def test_market_session_returns_ok_false_when_non_dict():
    api = FakeAPI()
    api.get_return = ["not", "a", "dict"]

    out = api_client.market_session(api)

    assert out == {"ok": False}
    assert api.get_calls == [
        ("/api/market/us/session", None),
    ]


def test_market_session_returns_ok_false_on_exception():
    api = FakeAPI()
    api.get_side_effect = RuntimeError("boom")

    out = api_client.market_session(api)

    assert out == {"ok": False}
    assert api.get_calls == [
        ("/api/market/us/session", None),
    ]


def test_sync_trade_fills_posts_correct_payload():
    api = FakeAPI()

    api_client.sync_trade_fills(api, user_id="u1", bot_id="ema_trend", mode="paper")

    assert len(api.post_calls) == 1
    path, payload = api.post_calls[0]
    assert path == "/api/trade_fills/sync_runner"
    assert payload == {"user_id": "u1", "bot_id": "ema_trend", "mode": "paper"}


def test_post_heartbeat_posts_required_fields_and_defaults(monkeypatch):
    monkeypatch.setattr(api_client, "now_epoch", lambda: 999)
    api = FakeAPI()

    api_client.post_heartbeat(
        api,
        bot_id="ema_trend",
        intent="running",
        effective_state="running",
        mode="paper",
    )

    assert len(api.post_calls) == 1
    path, payload = api.post_calls[0]
    assert path == "/api/bots/heartbeat"
    assert payload is not None

    # Required core fields
    assert payload["bot_id"] == "ema_trend"
    assert payload["intent"] == "running"
    assert payload["effective_state"] == "running"
    assert payload["mode"] == "paper"

    # Timestamps (both should use now_epoch())
    assert payload["heartbeat_at"] == 999
    assert payload["last_run"] == 999
    assert payload["last_tick"] == 999

    # Optional fields should exist (explicitly None by default)
    assert payload["reason_code"] is None
    assert payload["message"] is None
    assert payload["paused_reason"] is None
    assert payload["next_open_epoch"] is None
    assert payload["last_error"] is None


def test_post_heartbeat_respects_last_tick_and_optional_fields(monkeypatch):
    monkeypatch.setattr(api_client, "now_epoch", lambda: 111)
    api = FakeAPI()

    api_client.post_heartbeat(
        api,
        bot_id="ema_trend",
        intent="running",
        effective_state="waiting_for_market",
        mode="paper",
        message="Waiting",
        reason_code="market_closed",
        paused_reason="Market closed",
        next_open_epoch=222,
        last_error="none",
        last_tick=333,
    )

    path, payload = api.post_calls[0]
    assert path == "/api/bots/heartbeat"
    assert payload is not None

    assert payload["heartbeat_at"] == 111
    assert payload["last_run"] == 111
    assert payload["last_tick"] == 333  # explicit override

    assert payload["message"] == "Waiting"
    assert payload["reason_code"] == "market_closed"
    assert payload["paused_reason"] == "Market closed"
    assert payload["next_open_epoch"] == 222
    assert payload["last_error"] == "none"
