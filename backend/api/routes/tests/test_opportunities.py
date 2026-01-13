# backend/api/routes/tests/test_opportunities.py
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
    # default tests assume no secret required
    monkeypatch.setattr(mod, "BOT_RUNNER_SECRET", "")
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

    assert len(body["symbols"]) == 12  # universe only has 12 right now


def test_runner_opportunities_caches_when_not_busted(client, monkeypatch):
    # Freeze time to validate cache reuse (generatedAt should remain same)
    monkeypatch.setattr(mod, "_now_epoch", lambda: 111)

    r1 = client.get("/api/opportunities", params={"limit": 3})
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["generatedAt"] == 111

    # change time, but call again without cache_bust => should reuse cached payload
    monkeypatch.setattr(mod, "_now_epoch", lambda: 222)
    r2 = client.get("/api/opportunities", params={"limit": 3})
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["generatedAt"] == 111  # cached


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

    # missing => 401
    r1 = client.get("/api/opportunities", params={"cache_bust": 1})
    assert r1.status_code == 401
    assert r1.json()["detail"]["code"] == "BOT_RUNNER_UNAUTHORIZED"

    # correct header => ok
    r2 = client.get("/api/opportunities", headers={"x-bot-runner-secret": "sekret"}, params={"cache_bust": 1})
    assert r2.status_code == 200
    assert r2.json()["ok"] is True


def test_runner_opportunities_requires_secret_when_configured_query(client, monkeypatch):
    monkeypatch.setattr(mod, "BOT_RUNNER_SECRET", "sekret")

    r = client.get("/api/opportunities", params={"bot_runner_secret": "sekret", "cache_bust": 1})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_bot_top_opportunities_placeholder(client, monkeypatch):
    monkeypatch.setattr(mod, "_now_epoch", lambda: 123)

    resp = client.get("/api/opportunities/bot/top", params={"limit": 9})
    assert resp.status_code == 200
    body = resp.json()

    assert body["ok"] is True
    assert body["requiresBotRunning"] is True
    assert body["items"] == []
    assert body["limit"] == 9
    assert body["asOf"] == 123
