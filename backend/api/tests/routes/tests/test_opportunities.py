from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import api.routes.opportunities as mod


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(mod.router)
    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture(autouse=True)
def _clear_cache_and_secret(monkeypatch):
    mod._CACHE.clear()
    monkeypatch.setattr(mod, "BOT_RUNNER_SECRET", "")
    monkeypatch.setattr(mod, "ENV", "development")
    monkeypatch.setattr(mod, "SAFE_FALLBACK_ENABLED", True)
    monkeypatch.setattr(mod, "SAFE_FALLBACK_SYMBOLS_RAW", "SPY,QQQ,AAPL")
    yield
    mod._CACHE.clear()


def test_runner_opportunities_returns_symbols_and_generated_at(client):
    resp = client.get("/api/opportunities", params={"limit": 5, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()

    assert body["ok"] is True
    assert body["symbols"] == ["SPY", "QQQ", "IWM", "AAPL", "MSFT"]
    assert isinstance(body["generatedAt"], int)


def test_runner_opportunities_respects_limit_max_50(client):
    resp = client.get("/api/opportunities", params={"limit": 50, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["symbols"]) == 12


def test_runner_opportunities_caches_when_not_busted(client, monkeypatch):
    monkeypatch.setattr(mod, "_now_epoch", lambda: 111)

    r1 = client.get("/api/opportunities", params={"limit": 3})
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["generatedAt"] == 111

    monkeypatch.setattr(mod, "_now_epoch", lambda: 222)
    r2 = client.get("/api/opportunities", params={"limit": 3})
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["generatedAt"] == 111


def test_runner_opportunities_cache_bust_forces_new(client, monkeypatch):
    monkeypatch.setattr(mod, "_now_epoch", lambda: 111)
    r1 = client.get("/api/opportunities", params={"limit": 3})
    assert r1.status_code == 200
    assert r1.json()["generatedAt"] == 111

    monkeypatch.setattr(mod, "_now_epoch", lambda: 222)
    r2 = client.get("/api/opportunities", params={"limit": 3, "cache_bust": 1})
    assert r2.status_code == 200
    assert r2.json()["generatedAt"] == 222


def test_runner_opportunities_requires_secret_when_configured_header(client, monkeypatch):
    monkeypatch.setattr(mod, "BOT_RUNNER_SECRET", "sekret")

    r1 = client.get("/api/opportunities", params={"cache_bust": 1})
    assert r1.status_code == 401
    assert r1.json()["detail"]["code"] == "BOT_RUNNER_UNAUTHORIZED"

    r2 = client.get("/api/opportunities", headers={"x-bot-runner-secret": "sekret"}, params={"cache_bust": 1})
    assert r2.status_code == 200
    assert r2.json()["ok"] is True


def test_runner_opportunities_requires_secret_when_configured_query(client, monkeypatch):
    monkeypatch.setattr(mod, "BOT_RUNNER_SECRET", "sekret")

    r = client.get("/api/opportunities", params={"bot_runner_secret": "sekret", "cache_bust": 1})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_runner_opportunities_production_requires_bearer(client, monkeypatch):
    monkeypatch.setattr(mod, "ENV", "production")

    r = client.get("/api/opportunities", params={"cache_bust": 1})
    assert r.status_code == 401
    assert r.json()["detail"]["code"] == "BOT_RUNNER_UNAUTHORIZED"


def test_runner_opportunities_accepts_valid_bearer_and_fetches_leaders(client, monkeypatch):
    monkeypatch.setattr(mod, "ENV", "production")
    monkeypatch.setattr(mod, "_maybe_runner_user_id_from_bearer", lambda request: "user-1")
    monkeypatch.setattr(
        mod,
        "_fetch_market_leaders_for_user",
        lambda **kwargs: {
            "items": [{"symbol": "NVDA"}, {"symbol": "AMD"}],
            "meta": {"source": "leaders"},
        },
    )

    r = client.get(
        "/api/opportunities",
        headers={"authorization": "Bearer token"},
        params={"cache_bust": 1, "limit": 5, "bot_id": "ema_trend"},
    )
    assert r.status_code == 200
    body = r.json()

    assert body["ok"] is True
    assert body["symbols"][:5] == ["NVDA", "AMD", "SPY", "QQQ", "AAPL"]
    assert body["meta"]["runner_user_id"] == "user-1"
    assert body["meta"]["leaders"]["fetch_ok"] is True
    assert body["meta"]["leaders"]["count"] == 2
    assert body["meta"]["leaders_payload_meta"] == {"source": "leaders"}


def test_runner_opportunities_leaders_fetch_failure_adds_warning(client, monkeypatch):
    monkeypatch.setattr(mod, "_maybe_runner_user_id_from_bearer", lambda request: "user-1")

    def boom(**kwargs):
        raise RuntimeError("leaders failed")

    monkeypatch.setattr(mod, "_fetch_market_leaders_for_user", boom)

    r = client.get(
        "/api/opportunities",
        headers={"authorization": "Bearer token"},
        params={"cache_bust": 1, "limit": 4, "bot_id": "orb"},
    )
    assert r.status_code == 200
    body = r.json()

    assert body["ok"] is True
    assert body["symbols"][:4] == ["TSLA", "NVDA", "AMD", "SPY"]
    warning_codes = [w["code"] for w in body["meta"]["warnings"]]
    assert "LEADERS_FETCH_FAILED" in warning_codes
    assert body["meta"]["leaders"]["fetch_ok"] is False


def test_runner_opportunities_dev_mode_without_auth_adds_warning(client):
    r = client.get("/api/opportunities", params={"cache_bust": 1, "limit": 3})
    assert r.status_code == 200
    body = r.json()

    assert body["meta"]["requires_auth"] is False
    warning_codes = [w["code"] for w in body["meta"]["warnings"]]
    assert "DEV_AUTH_DISABLED" in warning_codes


def test_runner_opportunities_uses_safe_fallback_when_no_symbols(client, monkeypatch):
    monkeypatch.setattr(mod, "_maybe_runner_user_id_from_bearer", lambda request: None)
    monkeypatch.setattr(mod, "_FALLBACK_BY_BOT", {})
    monkeypatch.setattr(mod, "_FALLBACK_GLOBAL", [])
    monkeypatch.setattr(mod, "SAFE_FALLBACK_ENABLED", True)
    monkeypatch.setattr(mod, "SAFE_FALLBACK_SYMBOLS_RAW", "XLF, SPY, XLF")

    r = client.get("/api/opportunities", params={"cache_bust": 1, "limit": 5})
    assert r.status_code == 200
    body = r.json()

    assert body["symbols"] == ["XLF", "SPY"]
    assert body["meta"]["safe_fallback"]["used"] is True
    warning_codes = [w["code"] for w in body["meta"]["warnings"]]
    assert "SAFE_FALLBACK_USED" in warning_codes


def test_runner_opportunities_safe_fallback_uses_default_symbols_when_csv_invalid(client, monkeypatch):
    monkeypatch.setattr(mod, "_FALLBACK_BY_BOT", {})
    monkeypatch.setattr(mod, "_FALLBACK_GLOBAL", [])
    monkeypatch.setattr(mod, "SAFE_FALLBACK_ENABLED", True)
    monkeypatch.setattr(mod, "SAFE_FALLBACK_SYMBOLS_RAW", "!!!, ???")

    r = client.get("/api/opportunities", params={"cache_bust": 1, "limit": 3})
    assert r.status_code == 200
    body = r.json()

    assert body["symbols"] == ["SPY", "QQQ"]


def test_runner_opportunities_bot_fallback_order_is_used(client):
    r = client.get("/api/opportunities", params={"cache_bust": 1, "limit": 4, "bot_id": "mean_revert"})
    assert r.status_code == 200
    body = r.json()

    assert body["symbols"][:4] == ["MSFT", "AMZN", "META", "SPY"]


def test_bot_top_opportunities_placeholder(client, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})

    resp = client.get("/api/opportunities/bot/top", params={"limit": 9})
    assert resp.status_code == 200
    body = resp.json()

    assert body == {"stocks": [], "crypto": [], "funds": []}


def test_clean_symbol_filters_bad_values():
    assert mod._clean_symbol("aapl") == "AAPL"
    assert mod._clean_symbol(" BRK.B ") == "BRK.B"
    assert mod._clean_symbol("BTC-USD") == "BTC-USD"
    assert mod._clean_symbol("") == ""
    assert mod._clean_symbol("waytoolongsymbolname123") == ""
    assert mod._clean_symbol("AAPL$") == ""


def test_parse_csv_symbols_dedupes_and_sanitizes():
    assert mod._parse_csv_symbols("spy,QQQ, spy, ,AAPL") == ["SPY", "QQQ", "AAPL"]


def test_unique_extend_only_adds_clean_unique_symbols():
    dst = ["SPY"]
    seen = {"SPY"}

    mod._unique_extend(dst, seen, ["QQQ", "SPY", "BAD$", "AAPL"])

    assert dst == ["SPY", "QQQ", "AAPL"]
    assert seen == {"SPY", "QQQ", "AAPL"}


def test_cache_helpers_respect_expiry(monkeypatch):
    times = {"now": 100.0}
    monkeypatch.setattr(mod.time, "time", lambda: times["now"])

    mod._cache_set("k1", {"ok": True}, ttl=10)
    assert mod._cache_get("k1") == {"ok": True}

    times["now"] = 111.0
    assert mod._cache_get("k1") is None


def test_extract_leader_symbols_only_keeps_valid_symbols():
    payload = {
        "items": [
            {"symbol": "AAPL"},
            {"symbol": "bad$"},
            {"symbol": "MSFT"},
            "not-a-dict",
            {},
        ]
    }

    assert mod._extract_leader_symbols(payload) == ["AAPL", "MSFT"]