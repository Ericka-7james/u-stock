# backend/api/routes/tests/test_market_us.py
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi import HTTPException
import pytest

import api.routes.market_us as mod


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


class FakeResp:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.text = text
        self.ok = 200 <= status_code < 300

    def json(self):
        return self._payload


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


def test_market_us_success_normalizes_and_returns_items(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [
        {
            "api_key_enc": "ENC_K",
            "api_secret_enc": "ENC_S",
            "mode": "paper",
            "status": "connected",
        }
    ]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC(" + str(s) + ")")

    payload = {
        "gainers": [
            {"symbol": "aapl", "change_pct": 0.0123, "last": 110, "prev_close": 100},
        ],
        "losers": [
            {"ticker": "tsla", "changePct": 1.5, "last_price": 210, "prevClose": 200},
        ],
    }

    monkeypatch.setattr(mod, "_safe_get", lambda url, headers: FakeResp(200, payload))

    resp = client.get("/api/market/leaders", params={"market": "stocks", "direction": "both", "limit": 8, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()

    assert body["ok"] is True
    assert body["source"] == "ALPACA"
    assert body["market"] == "stocks"
    assert body["direction"] == "both"
    assert body["mode"] == "paper"
    assert "asOf" in body

    # Should contain both items, normalized
    items = body["items"]
    assert len(items) == 2

    assert items[0]["symbol"] == "AAPL"
    assert items[0]["direction"] == "up"
    assert items[0]["changePct"] == pytest.approx(1.23)  # fraction -> percent points
    assert items[0]["last"] == 110.0
    assert items[0]["prevClose"] == 100.0

    assert items[1]["symbol"] == "TSLA"
    assert items[1]["direction"] == "down"
    assert items[1]["changePct"] == pytest.approx(1.5)
    assert items[1]["last"] == 210.0
    assert items[1]["prevClose"] == 200.0

    # Ensure integrations table was queried correctly
    assert ("table", "integrations") in sb.calls
    assert any(
        c[0] == "execute"
        and ("user_id", "user-1") in c[3]
        and ("provider", "alpaca") in c[3]
        for c in sb.calls
    )


def test_market_us_direction_up_limits_to_gainers(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    payload = {
        "gainers": [{"symbol": "AAPL", "change_pct": 0.01}],
        "losers": [{"symbol": "TSLA", "change_pct": 0.99}],
    }
    monkeypatch.setattr(mod, "_safe_get", lambda url, headers: FakeResp(200, payload))

    resp = client.get("/api/market/leaders", params={"direction": "up", "limit": 1, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["symbol"] == "AAPL"
    assert body["items"][0]["direction"] == "up"


def test_market_us_returns_400_when_not_connected(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = []  # no row

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "ALPACA_NOT_CONNECTED"


def test_market_us_returns_401_when_alpaca_rejects_keys(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    monkeypatch.setattr(mod, "_safe_get", lambda url, headers: FakeResp(401, {}, text="nope"))

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "ALPACA_INVALID_KEY"


def test_market_us_returns_502_on_404_source_not_found(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    monkeypatch.setattr(mod, "_safe_get", lambda url, headers: FakeResp(404, {}, text="missing"))

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "SOURCE_NOT_FOUND"


def test_market_us_returns_502_on_network_error(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    def boom(url, headers):
        raise HTTPException(status_code=502, detail={"code": "ALPACA_NETWORK_ERROR"})

    monkeypatch.setattr(mod, "_safe_get", boom)

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "ALPACA_NETWORK_ERROR"


def test_market_us_caches_per_user(client, monkeypatch):
    sb = FakeSupabase()
    sb.data = [{"api_key_enc": "K", "api_secret_enc": "S", "mode": "paper", "status": "connected"}]

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: "DEC")

    calls = {"safe_get": 0}

    def fake_safe_get(url, headers):
        calls["safe_get"] += 1
        return FakeResp(200, {"gainers": [{"symbol": "AAPL", "change_pct": 0.01}], "losers": []})

    monkeypatch.setattr(mod, "_safe_get", fake_safe_get)

    # user-1 caches
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})
    r1 = client.get("/api/market/leaders", params={"direction": "up"})
    assert r1.status_code == 200
    assert calls["safe_get"] == 1

    # user-1 should hit cache
    r2 = client.get("/api/market/leaders", params={"direction": "up"})
    assert r2.status_code == 200
    assert calls["safe_get"] == 1

    # user-2 should NOT hit user-1 cache
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-2"})
    r3 = client.get("/api/market/leaders", params={"direction": "up"})
    assert r3.status_code == 200
    assert calls["safe_get"] == 2
