# backend/api/routes/tests/test_market_leaders.py
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

import api.routes.market_leaders as mod


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


def test_market_leaders_filters_alpha_dedupes_and_scores(client, monkeypatch):
    # creds: (user_id, api_key, api_secret, mode)
    monkeypatch.setattr(mod, "_get_user_alpaca_creds", lambda req, resp: ("user-1", "k", "s", "paper"))

    # movers includes duplicates + non-alpha symbols
    monkeypatch.setattr(
        mod,
        "_fetch_movers",
        lambda api_key, api_secret, direction, limit: [
            {"symbol": "AAPL"},
            {"symbol": "AAPL"},      # dup
            {"symbol": "BRK.B"},     # non-alpha
            {"symbol": "tsla"},      # ok, will uppercase
            {"symbol": "SPY1"},      # non-alpha
        ],
    )

    # snapshots provide last/prev for AAPL, only last for TSLA
    monkeypatch.setattr(
        mod,
        "_fetch_snapshots",
        lambda api_key, api_secret, symbols: {
            "AAPL": {"latestTrade": {"p": 110.0}, "prevDailyBar": {"c": 100.0}},
            "TSLA": {"latestTrade": {"p": 210.0}},  # prev missing -> computed
        },
    )

    # batch prevclose provides TSLA prevclose
    monkeypatch.setattr(mod, "_fetch_prevclose_from_bars_batch", lambda api_key, api_secret, symbols: {"TSLA": 200.0})
    monkeypatch.setattr(mod, "_fetch_prevclose_from_bars_single", lambda api_key, api_secret, sym: None)

    resp = client.get("/api/market/leaders", params={"limit": 2, "fetch_multiplier": 5, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()

    assert body["ok"] is True
    assert body["source"] == "ALPACA"
    assert body["mode"] == "paper"

    # Only AAPL and TSLA remain (alpha-only + dedupe)
    symbols = [it["symbol"] for it in body["items"]]
    assert symbols == ["AAPL", "TSLA"]  # AAPL score higher (10% vs 5%)

    aapl = body["items"][0]
    tsla = body["items"][1]

    assert aapl["prevCloseComputed"] is False
    assert aapl["score"] == pytest.approx(10.0)

    assert tsla["prevCloseComputed"] is True
    assert tsla["score"] == pytest.approx(5.0)

    assert body["meta"]["computed_prevclose_count"] == 1
    assert body["meta"]["source_label"] == "ALPACA+Computed"
    assert body["meta"]["bars_batch_hit"] == 1
    assert body["meta"]["bars_single_hit"] == 0


def test_market_leaders_uses_single_fallback_when_batch_missing(client, monkeypatch):
    monkeypatch.setattr(mod, "_get_user_alpaca_creds", lambda req, resp: ("user-1", "k", "s", "paper"))
    monkeypatch.setattr(mod, "_fetch_movers", lambda *a, **k: [{"symbol": "MSFT"}])
    monkeypatch.setattr(mod, "_fetch_snapshots", lambda *a, **k: {"MSFT": {"latestTrade": {"p": 105.0}}})

    # batch returns None -> single returns value
    monkeypatch.setattr(mod, "_fetch_prevclose_from_bars_batch", lambda *a, **k: {"MSFT": None})
    monkeypatch.setattr(mod, "_fetch_prevclose_from_bars_single", lambda *a, **k: 100.0)

    resp = client.get("/api/market/leaders", params={"limit": 1, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()
    assert body["items"][0]["symbol"] == "MSFT"
    assert body["items"][0]["prevClose"] == 100.0
    assert body["items"][0]["prevCloseComputed"] is True
    assert body["meta"]["bars_batch_hit"] == 0
    assert body["meta"]["bars_single_hit"] == 1


def test_market_leaders_caches_per_user_and_bypasses_when_cache_bust(client, monkeypatch):
    calls = {"movers": 0}

    def fake_movers(*a, **k):
        calls["movers"] += 1
        return [{"symbol": "AAPL"}]

    monkeypatch.setattr(mod, "_fetch_movers", fake_movers)
    monkeypatch.setattr(
        mod,
        "_fetch_snapshots",
        lambda *a, **k: {"AAPL": {"latestTrade": {"p": 110}, "prevDailyBar": {"c": 100}}},
    )
    monkeypatch.setattr(mod, "_fetch_prevclose_from_bars_batch", lambda *a, **k: {})
    monkeypatch.setattr(mod, "_fetch_prevclose_from_bars_single", lambda *a, **k: None)

    # user-1 first request caches
    monkeypatch.setattr(mod, "_get_user_alpaca_creds", lambda req, resp: ("user-1", "k", "s", "paper"))
    r1 = client.get("/api/market/leaders", params={"limit": 1, "cache_ttl": 60})
    assert r1.status_code == 200
    assert calls["movers"] == 1

    # user-1 second request uses cache
    r2 = client.get("/api/market/leaders", params={"limit": 1, "cache_ttl": 60})
    assert r2.status_code == 200
    assert calls["movers"] == 1  # unchanged

    # cache_bust bypasses cache
    r3 = client.get("/api/market/leaders", params={"limit": 1, "cache_ttl": 60, "cache_bust": 1})
    assert r3.status_code == 200
    assert calls["movers"] == 2

    # user-2 should not hit user-1 cache
    monkeypatch.setattr(mod, "_get_user_alpaca_creds", lambda req, resp: ("user-2", "k", "s", "paper"))
    r4 = client.get("/api/market/leaders", params={"limit": 1, "cache_ttl": 60})
    assert r4.status_code == 200
    assert calls["movers"] == 3


def test_market_leaders_propagates_401_unauthorized(client, monkeypatch):
    monkeypatch.setattr(mod, "_get_user_alpaca_creds", lambda req, resp: ("user-1", "k", "s", "paper"))

    def fake_movers(*a, **k):
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})

    monkeypatch.setattr(mod, "_fetch_movers", fake_movers)

    resp = client.get("/api/market/leaders")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "ALPACA_UNAUTHORIZED"
