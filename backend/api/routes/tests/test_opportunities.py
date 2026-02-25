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


def _assert_opps_shape(body: dict, *, max_len: int | None = None):
    assert body["ok"] in (True, False)
    assert isinstance(body.get("symbols"), list)
    assert all(isinstance(s, str) for s in body["symbols"])
    assert len(body["symbols"]) == len(set(body["symbols"]))  # deduped
    assert isinstance(body.get("generatedAt"), int)

    if max_len is not None:
        assert len(body["symbols"]) <= max_len


def test_runner_opportunities_returns_shape(client):
    resp = client.get("/api/opportunities", params={"limit": 5, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()

    _assert_opps_shape(body, max_len=5)


def test_runner_opportunities_respects_limit_max_50(client):
    resp = client.get("/api/opportunities", params={"limit": 50, "cache_bust": 1})
    assert resp.status_code == 200
    body = resp.json()

    _assert_opps_shape(body, max_len=50)


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
    assert b2["symbols"] == b1["symbols"]


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
    _assert_opps_shape(r2.json())


def test_runner_opportunities_requires_secret_when_configured_query(client, monkeypatch):
    monkeypatch.setattr(mod, "BOT_RUNNER_SECRET", "sekret")

    r = client.get("/api/opportunities", params={"bot_runner_secret": "sekret", "cache_bust": 1})
    assert r.status_code == 200
    _assert_opps_shape(r.json())


def test_bot_top_opportunities_placeholder(client, monkeypatch):
    # ✅ bypass cookie auth
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user-1"})

    resp = client.get("/api/opportunities/bot/top", params={"limit": 9})
    assert resp.status_code == 200

    # ✅ new safe placeholder shape
    assert resp.json() == {"stocks": [], "crypto": [], "funds": []}