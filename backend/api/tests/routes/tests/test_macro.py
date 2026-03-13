# backend/api/routes/tests/test_macro.py
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import api.routes.macro as mod


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(mod.router)
    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


def test_macro_summary_success_returns_envelope_and_cache_header(client, monkeypatch):
    payload = {"cpi": 3.1}

    monkeypatch.delenv("MACRO_TTL_SECONDS", raising=False)

    def fake_get_macro_summary(ttl_seconds: int):
        assert ttl_seconds == 600
        return payload

    monkeypatch.setattr(mod, "get_macro_summary", fake_get_macro_summary)

    resp = client.get("/api/macro/summary")
    assert resp.status_code == 200

    body = resp.json()
    assert body["ok"] is True
    assert body["source"] == "fred"
    assert body["ttl_seconds"] == 600
    assert isinstance(body["as_of"], int)
    assert body["data"] == payload

    assert resp.headers["Cache-Control"] == "public, max-age=600"


def test_macro_summary_ttl_env_is_clamped_low(client, monkeypatch):
    monkeypatch.setenv("MACRO_TTL_SECONDS", "10")  # too low -> clamp to 60

    monkeypatch.setattr(mod, "get_macro_summary", lambda ttl_seconds: {"ok": True})

    resp = client.get("/api/macro/summary")
    assert resp.status_code == 200
    assert resp.headers["Cache-Control"] == "public, max-age=60"
    assert resp.json()["ttl_seconds"] == 60


def test_macro_summary_ttl_env_is_clamped_high(client, monkeypatch):
    monkeypatch.setenv("MACRO_TTL_SECONDS", "999999")  # too high -> clamp to 3600

    monkeypatch.setattr(mod, "get_macro_summary", lambda ttl_seconds: {"ok": True})

    resp = client.get("/api/macro/summary")
    assert resp.status_code == 200
    assert resp.headers["Cache-Control"] == "public, max-age=3600"
    assert resp.json()["ttl_seconds"] == 3600


def test_macro_summary_ttl_env_invalid_uses_default(client, monkeypatch):
    monkeypatch.setenv("MACRO_TTL_SECONDS", "not-an-int")

    monkeypatch.setattr(mod, "get_macro_summary", lambda ttl_seconds: {"ok": True})

    resp = client.get("/api/macro/summary")
    assert resp.status_code == 200
    assert resp.headers["Cache-Control"] == "public, max-age=600"
    assert resp.json()["ttl_seconds"] == 600


def test_macro_summary_returns_502_on_client_error(client, monkeypatch):
    monkeypatch.delenv("MACRO_TTL_SECONDS", raising=False)

    def fake_get_macro_summary(ttl_seconds: int):
        raise RuntimeError("fred down")

    monkeypatch.setattr(mod, "get_macro_summary", fake_get_macro_summary)

    resp = client.get("/api/macro/summary")
    assert resp.status_code == 502

    body = resp.json()
    assert body["detail"]["code"] == "MACRO_FAILED"
    assert body["detail"]["message"] == "Failed to load macro summary"
