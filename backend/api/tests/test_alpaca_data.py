# api/tests/test_alpaca_data.py
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.alpaca_data as mod


# -------------------------
# Fakes
# -------------------------
class _ExecResult:
    def __init__(self, data=None):
        self.data = data


class FakeQuery:
    def __init__(self, table, sb):
        self._table = table
        self._sb = sb
        self._filters = []
        self._select_cols = None
        self._limit = None

    def select(self, cols):
        self._select_cols = cols
        return self

    def eq(self, k, v):
        self._filters.append((k, v))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        self._sb.calls.append(("execute", self._table, self._select_cols, tuple(self._filters), self._limit))
        return _ExecResult(data=self._sb.data)


class FakeSupabase:
    def __init__(self, data=None, fail=False):
        self.data = data or []
        self.fail = fail
        self.calls = []

    def table(self, name):
        self.calls.append(("table", name))
        if self.fail:
            raise RuntimeError("db down")
        return FakeQuery(name, self)


@pytest.fixture()
def app(monkeypatch):
    app = FastAPI()
    app.include_router(mod.router)

    # default auth passes
    monkeypatch.setattr(mod, "require_user", lambda request, response: {"id": "user-123"})

    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


# -------------------------
# helpers
# -------------------------
def _set_connected_integration(monkeypatch, mode="paper"):
    sb = FakeSupabase(
        data=[{"status": "connected", "api_key_enc": "K", "api_secret_enc": "S", "mode": mode}]
    )
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")
    return sb


def test_daily_bars_requires_symbol(client, monkeypatch):
    _set_connected_integration(monkeypatch)
    resp = client.get("/alpaca/bars/daily", params={"symbol": ""})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"


def test_daily_bars_happy_path_calls_stock_bars(client, monkeypatch):
    _set_connected_integration(monkeypatch)

    called = {}

    def fake_stock_bars(**kwargs):
        called.update(kwargs)
        return {
            "bars": [
                {"t": "2025-01-01T00:00:00Z", "o": 1, "h": 2, "l": 0.5, "c": 1.5, "v": 100},
            ],
            "meta": {"feed_used": "iex"},
        }

    monkeypatch.setattr(mod, "stock_bars", fake_stock_bars)
    monkeypatch.setenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets")
    monkeypatch.setenv("ALPACA_STOCK_FEED", "iex")

    resp = client.get("/alpaca/bars/daily", params={"symbol": " aapl ", "limit": 50})
    assert resp.status_code == 200

    body = resp.json()
    assert body["ok"] is True
    assert body["symbol"] == "AAPL"
    assert body["mode"] == "paper"
    assert body["count"] == 1
    assert body["bars"][0]["close"] == 1.5
    assert body["meta"]["source"] == "alpaca"
    assert body["meta"]["feed_used"] == "iex"

    # ensure client called with expected pieces
    assert called["symbol"] == "AAPL"
    assert called["timeframe"] == "1Day"
    assert called["limit"] == 50
    assert called["feed"] == "iex"
    assert called["base_url"] == "https://data.alpaca.markets"
    assert called["api_key"] == "dec(K)"
    assert called["api_secret"] == "dec(S)"


def test_daily_bars_clamps_limit(client, monkeypatch):
    _set_connected_integration(monkeypatch)

    def fake_stock_bars(**kwargs):
        # should clamp to hi=1000
        assert kwargs["limit"] == 1000
        return {"bars": [], "meta": {}}

    monkeypatch.setattr(mod, "stock_bars", fake_stock_bars)

    resp = client.get("/alpaca/bars/daily", params={"symbol": "AAPL", "limit": 999999})
    assert resp.status_code == 200
    assert resp.json()["count"] == 0


def test_daily_bars_returns_500_when_stock_bars_raises(client, monkeypatch):
    _set_connected_integration(monkeypatch)

    def boom(**kwargs):
        raise RuntimeError("alpaca down")

    monkeypatch.setattr(mod, "stock_bars", boom)

    resp = client.get("/alpaca/bars/daily", params={"symbol": "AAPL"})
    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "ALPACA_DAILY_BARS_FAILED"


def test_crypto_daily_requires_slash_symbol(client, monkeypatch):
    _set_connected_integration(monkeypatch)
    resp = client.get("/alpaca/crypto/bars/daily", params={"symbol": "BTCUSD"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "BAD_REQUEST"


def test_crypto_daily_happy_path_calls_crypto_bars(client, monkeypatch):
    _set_connected_integration(monkeypatch, mode="live")

    called = {}

    def fake_crypto_bars(**kwargs):
        called.update(kwargs)
        sym = kwargs["symbols"][0]
        return {
            "bars": {
                sym: [
                    {"t": "2025-01-01T00:00:00Z", "o": 10, "h": 12, "l": 9, "c": 11, "v": 123},
                ]
            }
        }

    monkeypatch.setattr(mod, "crypto_bars", fake_crypto_bars)
    monkeypatch.setenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets")

    resp = client.get("/alpaca/crypto/bars/daily", params={"symbol": " btc/usd ", "limit": 20})
    assert resp.status_code == 200

    body = resp.json()
    assert body["ok"] is True
    assert body["symbol"] == "BTC/USD"
    assert body["mode"] == "live"
    assert body["count"] == 1
    assert body["bars"][0]["close"] == 11

    assert called["symbols"] == ["BTC/USD"]
    assert called["timeframe"] == "1Day"
    assert called["limit"] == 20
    assert called["base_url"] == "https://data.alpaca.markets"
    assert called["api_key"] == "dec(K)"
    assert called["api_secret"] == "dec(S)"


def test_load_keys_not_connected_returns_400(client, monkeypatch):
    sb = FakeSupabase(data=[{"status": "paused"}])
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    resp = client.get("/alpaca/bars/daily", params={"symbol": "AAPL"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "ALPACA_NOT_CONNECTED"


def test_supabase_failure_returns_500(client, monkeypatch):
    sb = FakeSupabase(fail=True)
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)

    resp = client.get("/alpaca/bars/daily", params={"symbol": "AAPL"})
    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "SUPABASE_QUERY_FAILED"
