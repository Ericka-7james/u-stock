# api/tests/test_alpaca_trading.py
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi import HTTPException

import api.alpaca_trading as mod


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
    def __init__(self, data=None):
        self.data = data or []
        self.calls = []

    def table(self, name):
        self.calls.append(("table", name))
        return FakeQuery(name, self)


class FakeResp:
    def __init__(self, status_code=200, json_data=None, text=""):
        self.status_code = status_code
        self._json_data = json_data
        self.text = text

    def json(self):
        return self._json_data


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


def _connected_sb(mode="paper"):
    return FakeSupabase(data=[{"status": "connected", "api_key_enc": "K", "api_secret_enc": "S", "mode": mode}])


def test_summary_returns_400_when_not_connected(client, monkeypatch):
    sb = FakeSupabase(data=[])
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    resp = client.get("/alpaca/trading/summary")
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "ALPACA_NOT_CONNECTED"


def test_summary_returns_401_when_alpaca_rejects_keys(client, monkeypatch):
    sb = _connected_sb()
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    monkeypatch.setattr(mod, "_safe_get", lambda url, params, headers: FakeResp(status_code=401, json_data=[], text="nope"))

    resp = client.get("/alpaca/trading/summary")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "ALPACA_INVALID_KEY"


def test_summary_returns_502_on_alpaca_4xx(client, monkeypatch):
    sb = _connected_sb()
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    monkeypatch.setattr(mod, "_safe_get", lambda url, params, headers: FakeResp(status_code=429, json_data=[], text="rate limit"))

    resp = client.get("/alpaca/trading/summary")
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "ALPACA_TRADING_API_ERROR"
    assert "rate limit" in resp.json()["detail"]["raw"]


def test_summary_returns_502_on_network_error(client, monkeypatch):
    sb = _connected_sb()
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    def boom(url, params, headers):
        raise HTTPException(status_code=502, detail={"code": "NETWORK_ERROR"})

    monkeypatch.setattr(mod, "_safe_get", boom)

    resp = client.get("/alpaca/trading/summary")
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "NETWORK_ERROR"


def test_summary_happy_path_builds_trades_fifo(client, monkeypatch):
    sb = _connected_sb(mode="paper")
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    fills = [
        {"symbol": "AAPL", "side": "buy", "qty": "2", "price": "10", "transaction_time": "2025-01-01T00:00:00Z"},
        {"symbol": "AAPL", "side": "sell", "qty": "1", "price": "12", "transaction_time": "2025-01-02T00:00:00Z"},
    ]

    monkeypatch.setattr(mod, "_safe_get", lambda url, params, headers: FakeResp(status_code=200, json_data=fills, text=""))

    resp = client.get("/alpaca/trading/summary", params={"preset": "Week", "slippage_bps": 0, "fee_bps": 0})
    assert resp.status_code == 200

    body = resp.json()
    assert body["ok"] is True
    assert body["mode"] == "paper"
    assert body["preset"] == "Week"
    assert isinstance(body["trades"], list)
    assert len(body["trades"]) == 1

    trade = body["trades"][0]
    assert trade["symbol"] == "AAPL"
    assert trade["pnl"] == pytest.approx((12 - 10) * 1)


def test_fifo_costs_apply_slippage_and_fee():
    fills = [
        {"symbol": "AAPL", "side": "buy", "qty": "2", "price": "10", "transaction_time": "2025-01-01T00:00:00Z"},
        {"symbol": "AAPL", "side": "sell", "qty": "1", "price": "12", "transaction_time": "2025-01-02T00:00:00Z"},
    ]
    trades = mod._fifo_realized_trades_from_fills(fills, slippage_bps=10.0, fee_bps=5.0)
    assert len(trades) == 1
    gross = (12 - 10) * 1
    # slippage on both notionals: 10 bps => 0.001 * (10 + 12) = 0.022
    slip = (10.0 / 10000.0) * ((1 * 10) + (1 * 12))
    # fee on sell notional: 5 bps => 0.0005 * 12 = 0.006
    fee = (5.0 / 10000.0) * (1 * 12)
    assert trades[0]["pnl"] == pytest.approx(gross - (slip + fee))


def test_fifo_skips_bad_timestamps():
    fills = [
        {"symbol": "AAPL", "side": "buy", "qty": "2", "price": "10", "transaction_time": "not-a-date"},
        {"symbol": "AAPL", "side": "sell", "qty": "1", "price": "12", "transaction_time": "2025-01-02T00:00:00Z"},
    ]
    trades = mod._fifo_realized_trades_from_fills(fills)
    assert trades == []  # buy ignored => no lot => sell can't match
