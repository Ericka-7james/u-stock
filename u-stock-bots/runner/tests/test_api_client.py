# u-stock-bots/runner/tests/test_api_client.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import pytest

import runner.api_client as api_client


class FakeAPI:
    """
    Minimal stub for UStockAPI that records calls (including headers).
    """

    def __init__(self):
        self.get_calls: List[Tuple[str, Dict[str, Any], Dict[str, str]]] = []
        self.post_calls: List[Tuple[str, Dict[str, Any], Dict[str, str]]] = []

        # Optional behavior hooks
        self.get_return: Any = None
        self.get_side_effect: Exception | None = None

        self.post_return: Any = {"ok": True}
        self.post_side_effect: Exception | None = None

    def get(self, path: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Any:
        self.get_calls.append((path, dict(params or {}), dict(headers or {})))
        if self.get_side_effect is not None:
            raise self.get_side_effect
        return self.get_return

    def post(
        self, path: str, json: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None
    ) -> Any:
        self.post_calls.append((path, dict(json or {}), dict(headers or {})))
        if self.post_side_effect is not None:
            raise self.post_side_effect
        return self.post_return


def test_now_epoch_is_int_and_uses_time(monkeypatch):
    monkeypatch.setattr(api_client.time, "time", lambda: 1700000000.9)
    assert api_client.now_epoch() == 1700000000
    assert isinstance(api_client.now_epoch(), int)


def test_get_status_calls_correct_endpoint_and_params(monkeypatch):
    api = FakeAPI()
    api.get_return = {"ok": True, "bot_id": "ema_trend"}

    # get_status now requires a user_id (arg or env). Provide explicitly.
    out = api_client.get_status(api, "ema_trend", user_id="u1")

    assert out == {"ok": True, "bot_id": "ema_trend"}
    assert api.get_calls[0][0] == "/api/bots/status_runner"
    assert api.get_calls[0][1] == {"bot_id": "ema_trend", "user_id": "u1"}


def test_get_status_raises_when_user_id_missing(monkeypatch):
    api = FakeAPI()
    with pytest.raises(RuntimeError) as e:
        api_client.get_status(api, "ema_trend")
    assert "Runner missing user_id for get_status" in str(e.value)


def test_submit_intents_posts_payload_including_ts(monkeypatch):
    monkeypatch.setattr(api_client, "now_epoch", lambda: 123)
    api = FakeAPI()

    intents = [{"symbol": "AAPL", "side": "buy", "qty": 1}]
    api_client.submit_intents(api, "ema_trend", intents, user_id="u1")

    assert len(api.post_calls) == 1
    path, payload, _headers = api.post_calls[0]
    assert path == "/api/bots/submit-intents"
    assert payload["user_id"] == "u1"
    assert payload["bot_id"] == "ema_trend"
    assert payload["ts"] == 123
    assert payload["items"] == intents


def test_submit_intents_noops_when_user_id_missing(monkeypatch):
    api = FakeAPI()
    api_client.submit_intents(api, "ema_trend", [{"a": 1}], user_id=None)
    assert api.post_calls == []


def test_market_session_returns_dict_when_ok():
    api = FakeAPI()
    api.get_return = {"ok": True, "is_open": False}

    out = api_client.market_session(api, bot_id="ema_trend")

    assert out == {"ok": True, "is_open": False}
    assert api.get_calls == [
        ("/api/market/us/session", {}, {}),
    ]


def test_market_session_returns_ok_false_when_non_dict():
    api = FakeAPI()
    api.get_return = ["not", "a", "dict"]

    out = api_client.market_session(api, bot_id="ema_trend")

    assert out == {"ok": False}
    assert api.get_calls == [
        ("/api/market/us/session", {}, {}),
    ]


def test_market_session_returns_ok_false_on_exception():
    api = FakeAPI()
    api.get_side_effect = RuntimeError("boom")

    out = api_client.market_session(api, bot_id="ema_trend")

    assert out == {"ok": False}
    assert api.get_calls == [
        ("/api/market/us/session", {}, {}),
    ]


def test_sync_trade_fills_posts_correct_payload(monkeypatch):
    api = FakeAPI()

    api_client.sync_trade_fills(api, user_id="u1", bot_id="ema_trend", mode="paper")

    assert len(api.post_calls) == 1
    path, payload, _headers = api.post_calls[0]
    assert path == "/api/trade_fills/sync_runner"
    assert payload == {"bot_id": "ema_trend", "mode": "paper", "user_id": "u1"}


def test_post_heartbeat_posts_required_fields_and_defaults(monkeypatch):
    monkeypatch.setattr(api_client, "now_epoch", lambda: 999)
    api = FakeAPI()

    api_client.post_heartbeat(
        api,
        user_id="u1",
        bot_id="ema_trend",
        intent="running",
        effective_state="running",
        mode="paper",
    )

    assert len(api.post_calls) == 1
    path, payload, _headers = api.post_calls[0]
    assert path == "/api/bots/heartbeat"

    # Required core fields
    assert payload["user_id"] == "u1"
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
    # IMPORTANT: last_error is sent as "" to clear stale errors
    assert payload["last_error"] == ""


def test_post_heartbeat_respects_last_tick_and_optional_fields(monkeypatch):
    monkeypatch.setattr(api_client, "now_epoch", lambda: 111)
    api = FakeAPI()

    api_client.post_heartbeat(
        api,
        user_id="u1",
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

    path, payload, _headers = api.post_calls[0]
    assert path == "/api/bots/heartbeat"

    assert payload["heartbeat_at"] == 111
    assert payload["last_run"] == 111
    assert payload["last_tick"] == 333  # explicit override

    assert payload["message"] == "Waiting"
    assert payload["reason_code"] == "market_closed"
    assert payload["paused_reason"] == "Market closed"
    assert payload["next_open_epoch"] == 222
    assert payload["last_error"] == "none"


def test_heartbeat_tick_noops_without_runner_user_id(monkeypatch):
    # If env has no RUNNER_USER_ID/USTOCK_USER_ID, heartbeat_tick should do nothing.
    monkeypatch.delenv("RUNNER_USER_ID", raising=False)
    monkeypatch.delenv("USTOCK_USER_ID", raising=False)

    api = FakeAPI()
    api_client.heartbeat_tick(
        api,
        bot_id="ema_trend",
        intent="running",
        effective_state="running",
        mode="paper",
    )
    assert api.post_calls == []


def test_heartbeat_tick_posts_when_runner_user_id_present(monkeypatch):
    monkeypatch.setenv("RUNNER_USER_ID", "u1")
    monkeypatch.setattr(api_client, "now_epoch", lambda: 500)

    api = FakeAPI()
    api_client.heartbeat_tick(
        api,
        bot_id="ema_trend",
        intent="running",
        effective_state="running",
        mode="paper",
    )

    assert len(api.post_calls) == 1
    path, payload, _headers = api.post_calls[0]
    assert path == "/api/bots/heartbeat"
    assert payload["user_id"] == "u1"
    assert payload["last_tick"] == 500