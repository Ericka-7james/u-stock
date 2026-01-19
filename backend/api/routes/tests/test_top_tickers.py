# backend/api/routes/tests/test_top_tickers.py
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

import api.routes.top_tickers as mod


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
        self._select_cols = None
        self._filters = []
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
        if self._sb.fail_execute:
            raise RuntimeError("db down")
        return _ExecResult(data=self._sb.data)


class FakeSupabase:
    def __init__(self):
        self.calls = []
        self.fail_execute = False
        self.data = []

    def table(self, name):
        self.calls.append(("table", name))
        return FakeQuery(name, self)


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(mod.router)
    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_cache():
    mod._CACHE.clear()
    yield
    mod._CACHE.clear()


def test_top_tickers_success_top_gainers_normalizes_and_limits(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [
        {"api_key_enc": "ENC_K", "api_secret_enc": "ENC_S", "mode": "paper", "status": "connected"},
    ]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC(" + str(s) + ")")

    # Return a mix: valid dicts + invalid rows + missing symbol
    monkeypatch.setattr(
        mod,
        "_fetch_top_gainers",
        lambda api_key, api_secret, limit: [
            {"symbol": "aapl", "change_pct": 0.0123},
            {"symbol": "msft", "changePct": 1.5},
            {"S": "nvda", "percent_change": 123},  # scaled -> 1.23
            "bad",
            {"symbol": ""},  # dropped
        ],
    )

    resp = client.get("/api/market/us/top-tickers", params={"source": "top_gainers", "limit": 2, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()

    assert body["ok"] is True
    assert body["mode"] == "paper"
    assert body["source"] == "alpaca_top_gainers"
    assert body["count"] >= 3  # before slicing
    assert len(body["items"]) == 2

    assert body["items"][0]["symbol"] == "AAPL"
    assert body["items"][0]["changePct"] == pytest.approx(1.23)

    assert body["items"][1]["symbol"] == "MSFT"
    assert body["items"][1]["changePct"] == pytest.approx(1.5)


def test_top_tickers_most_active_path(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    monkeypatch.setattr(
        mod,
        "_fetch_most_actives",
        lambda api_key, api_secret, limit: [{"ticker": "TSLA", "pct_change": 0.01}],
    )

    resp = client.get("/api/market/us/top-tickers", params={"source": "most_active", "limit": 10, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "alpaca_most_active"
    assert body["items"][0]["symbol"] == "TSLA"
    assert body["items"][0]["changePct"] == pytest.approx(1.0)  # 0.01 -> 1.0%


def test_top_tickers_returns_400_when_not_connected(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = []  # no integration row

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)

    resp = client.get("/api/market/us/top-tickers", params={"cache_bust": 1})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "ALPACA_NOT_CONNECTED"


def test_top_tickers_returns_500_when_db_fails(client, monkeypatch):
    sb = FakeSupabase()
    sb.fail_execute = True

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)

    resp = client.get("/api/market/us/top-tickers", params={"cache_bust": 1})
    assert resp.status_code == 500
    assert "Failed to load integrations" in resp.json()["detail"]


def test_top_tickers_caches_per_user(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    calls = {"fetch": 0}

    def fake_fetch(*a, **k):
        calls["fetch"] += 1
        return [{"symbol": "AAPL", "changePct": 1.0}]

    monkeypatch.setattr(mod, "_fetch_top_gainers", fake_fetch)
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})

    r1 = client.get("/api/market/us/top-tickers", params={"source": "top_gainers", "limit": 1, "cache_ttl": 60})
    assert r1.status_code == 200
    assert calls["fetch"] == 1

    # second call should use cache
    r2 = client.get("/api/market/us/top-tickers", params={"source": "top_gainers", "limit": 1, "cache_ttl": 60})
    assert r2.status_code == 200
    assert calls["fetch"] == 1

    # different user => different cache key
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-2"})
    r3 = client.get("/api/market/us/top-tickers", params={"source": "top_gainers", "limit": 1, "cache_ttl": 60})
    assert r3.status_code == 200
    assert calls["fetch"] == 2


def test_top_tickers_cache_bust_forces_refresh(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    calls = {"fetch": 0}

    def fake_fetch(*a, **k):
        calls["fetch"] += 1
        return [{"symbol": "AAPL", "changePct": 1.0}]

    monkeypatch.setattr(mod, "_fetch_top_gainers", fake_fetch)

    r1 = client.get("/api/market/us/top-tickers", params={"cache_ttl": 60})
    assert r1.status_code == 200
    assert calls["fetch"] == 1

    r2 = client.get("/api/market/us/top-tickers", params={"cache_ttl": 60, "cache_bust": 1})
    assert r2.status_code == 200
    assert calls["fetch"] == 2
