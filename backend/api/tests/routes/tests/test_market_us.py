# backend/api/routes/tests/test_market_us.py
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

import api.routes.market_us as mod


# -------------------------
# Fakes
# -------------------------
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
    monkeypatch.setattr(mod, "get_user_alpaca_creds", lambda req, resp: ("user-1", "K", "S", "paper"))

    payload = {
        "gainers": [{"symbol": "aapl", "change_pct": 0.0123, "last": 110, "prev_close": 100}],
        "losers": [{"ticker": "tsla", "changePct": 1.5, "last_price": 210, "prevClose": 200}],
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

    items = body["items"]
    assert len(items) == 2

    assert items[0]["symbol"] == "AAPL"
    assert items[0]["direction"] == "up"
    assert items[0]["changePct"] == pytest.approx(1.23)
    assert items[0]["last"] == 110.0
    assert items[0]["prevClose"] == 100.0

    assert items[1]["symbol"] == "TSLA"
    assert items[1]["direction"] == "down"
    assert items[1]["changePct"] == pytest.approx(1.5)
    assert items[1]["last"] == 210.0
    assert items[1]["prevClose"] == 200.0


def test_market_us_direction_up_limits_to_gainers(client, monkeypatch):
    monkeypatch.setattr(mod, "get_user_alpaca_creds", lambda req, resp: ("user-1", "K", "S", "paper"))

    payload = {"gainers": [{"symbol": "AAPL", "change_pct": 0.01}], "losers": [{"symbol": "TSLA", "change_pct": 0.99}]}
    monkeypatch.setattr(mod, "_safe_get", lambda url, headers: FakeResp(200, payload))

    resp = client.get("/api/market/leaders", params={"direction": "up", "limit": 1, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["symbol"] == "AAPL"
    assert body["items"][0]["direction"] == "up"


def test_market_us_returns_400_when_not_connected(client, monkeypatch):
    def boom(req, resp):
        raise HTTPException(status_code=400, detail={"code": "ALPACA_NOT_CONNECTED"})

    monkeypatch.setattr(mod, "get_user_alpaca_creds", boom)

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "ALPACA_NOT_CONNECTED"


def test_market_us_returns_401_when_alpaca_rejects_keys(client, monkeypatch):
    monkeypatch.setattr(mod, "get_user_alpaca_creds", lambda req, resp: ("user-1", "K", "S", "paper"))
    monkeypatch.setattr(mod, "_safe_get", lambda url, headers: FakeResp(401, {}, text="nope"))

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "ALPACA_INVALID_KEY"


def test_market_us_returns_502_on_404_source_not_found(client, monkeypatch):
    monkeypatch.setattr(mod, "get_user_alpaca_creds", lambda req, resp: ("user-1", "K", "S", "paper"))
    monkeypatch.setattr(mod, "_safe_get", lambda url, headers: FakeResp(404, {}, text="missing"))

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "SOURCE_NOT_FOUND"


def test_market_us_returns_502_on_network_error(client, monkeypatch):
    monkeypatch.setattr(mod, "get_user_alpaca_creds", lambda req, resp: ("user-1", "K", "S", "paper"))

    def boom(url, headers):
        raise HTTPException(status_code=502, detail={"code": "ALPACA_NETWORK_ERROR"})

    monkeypatch.setattr(mod, "_safe_get", boom)

    resp = client.get("/api/market/leaders", params={"cache_bust": 1})
    assert resp.status_code == 502
    assert resp.json()["detail"]["code"] == "ALPACA_NETWORK_ERROR"


def test_market_us_caches_per_user(client, monkeypatch):
    calls = {"safe_get": 0}

    def fake_safe_get(url, headers):
        calls["safe_get"] += 1
        return FakeResp(200, {"gainers": [{"symbol": "AAPL", "change_pct": 0.01}], "losers": []})

    monkeypatch.setattr(mod, "_safe_get", fake_safe_get)

    def fake_creds(req, resp):
        user_id = req.headers.get("x-user", "user-1")
        return (user_id, "K", "S", "paper")

    monkeypatch.setattr(mod, "get_user_alpaca_creds", fake_creds)

    # user-1 caches
    r1 = client.get("/api/market/leaders", params={"direction": "up"}, headers={"x-user": "user-1"})
    assert r1.status_code == 200
    assert calls["safe_get"] == 1

    # user-1 should hit cache
    r2 = client.get("/api/market/leaders", params={"direction": "up"}, headers={"x-user": "user-1"})
    assert r2.status_code == 200
    assert calls["safe_get"] == 1

    # user-2 should NOT hit user-1 cache
    r3 = client.get("/api/market/leaders", params={"direction": "up"}, headers={"x-user": "user-2"})
    assert r3.status_code == 200
    assert calls["safe_get"] == 2
