from __future__ import annotations

from typing import Any, Dict
from unittest.mock import Mock

import pytest

import bots._shared.supabase_events as sb


def test_emit_event_returns_false_when_not_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    ok = sb.emit_event(bot_id="ema_trend", mode="paper", event_type="order_submitted", payload={"x": 1})
    assert ok is False


def test_emit_event_returns_false_when_bot_id_blank(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc")
    monkeypatch.setenv("SUPABASE_EVENTS_TABLE", "bot_events")

    # mock requests.post so we can assert it's not called
    post = Mock()
    monkeypatch.setattr(sb.requests, "post", post)

    ok = sb.emit_event(bot_id="   ", mode="paper", event_type="order_submitted", payload={"x": 1})
    assert ok is False
    post.assert_not_called()


def test_emit_event_normalizes_mode_and_symbol_and_builds_request(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc_key")
    monkeypatch.setenv("SUPABASE_EVENTS_TABLE", "bot_events")

    captured: Dict[str, Any] = {}

    class Resp:
        status_code = 201

    def fake_post(url, headers, json, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return Resp()

    monkeypatch.setattr(sb.requests, "post", fake_post)

    ok = sb.emit_event(
        bot_id="ema_trend",
        mode="LIVE",  # should normalize to "live"
        event_type="order_submitted",
        level="INFO",
        symbol="aapl",
        payload={"hello": "world"},
    )

    assert ok is True
    assert captured["url"] == "https://example.supabase.co/rest/v1/bot_events"
    assert captured["timeout"] == 8

    # headers
    assert captured["headers"]["apikey"] == "svc_key"
    assert captured["headers"]["Authorization"] == "Bearer svc_key"
    assert captured["headers"]["Content-Type"] == "application/json"

    # row
    row = captured["json"]
    assert row["bot_id"] == "ema_trend"
    assert row["mode"] == "live"
    assert row["level"] == "info"
    assert row["event_type"] == "order_submitted"
    assert row["symbol"] == "AAPL"
    assert isinstance(row["payload"], dict)
    assert "ts" in row


def test_emit_event_defaults_bad_mode_to_paper(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc_key")

    captured: Dict[str, Any] = {}

    class Resp:
        status_code = 200

    def fake_post(url, headers, json, timeout):
        captured["json"] = json
        return Resp()

    monkeypatch.setattr(sb.requests, "post", fake_post)

    ok = sb.emit_event(bot_id="ema_trend", mode="weird", event_type="order_failed", payload=None)
    assert ok is True
    assert captured["json"]["mode"] == "paper"
    assert captured["json"]["payload"] == {}


def test_emit_event_returns_false_on_non_2xx(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc_key")

    class Resp:
        status_code = 500

    monkeypatch.setattr(sb.requests, "post", lambda *a, **k: Resp())

    ok = sb.emit_event(bot_id="ema_trend", mode="paper", event_type="order_failed", payload={"e": "x"})
    assert ok is False


def test_emit_event_returns_false_on_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc_key")

    def boom(*a, **k):
        raise RuntimeError("no network")

    monkeypatch.setattr(sb.requests, "post", boom)

    ok = sb.emit_event(bot_id="ema_trend", mode="paper", event_type="order_failed", payload={"e": "x"})
    assert ok is False
