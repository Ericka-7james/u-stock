# backend/api/security/tests/test_bot_runner_dep.py
from __future__ import annotations

import jwt
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

import api.security.bot_runner_dep as mod


@pytest.fixture()
def app():
    app = FastAPI()

    @app.get("/protected")
    def protected(user_id: str = Depends(mod.require_bot_runner)):
        return {"ok": True, "user_id": user_id}

    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


def test_missing_authorization_header_returns_401(client):
    resp = client.get("/protected")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Missing Bearer token"


def test_wrong_prefix_returns_401(client):
    resp = client.get("/protected", headers={"Authorization": "Token abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Missing Bearer token"


def test_bearer_with_empty_token_returns_401(client):
    resp = client.get("/protected", headers={"Authorization": "Bearer   "})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Missing token"


def test_expired_signature_returns_401(client, monkeypatch):
    monkeypatch.setattr(mod, "load_bot_runner_config", lambda: {"dummy": True})

    def verify(_token, _cfg):
        raise jwt.ExpiredSignatureError("expired")

    monkeypatch.setattr(mod, "verify_bot_runner_token", verify)

    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Bot runner token expired"


def test_invalid_token_error_returns_401_with_message(client, monkeypatch):
    monkeypatch.setattr(mod, "load_bot_runner_config", lambda: {"dummy": True})

    def verify(_token, _cfg):
        raise jwt.InvalidTokenError("bad sig")

    monkeypatch.setattr(mod, "verify_bot_runner_token", verify)

    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid bot runner token: bad sig"


def test_missing_subject_returns_401(client, monkeypatch):
    monkeypatch.setattr(mod, "load_bot_runner_config", lambda: {"dummy": True})
    monkeypatch.setattr(mod, "verify_bot_runner_token", lambda _t, _c: {"sub": ""})

    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid token subject"


def test_success_returns_user_id(client, monkeypatch):
    monkeypatch.setattr(mod, "load_bot_runner_config", lambda: {"dummy": True})
    monkeypatch.setattr(mod, "verify_bot_runner_token", lambda _t, _c: {"sub": "user-123"})

    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "user_id": "user-123"}


def test_unexpected_exception_fails_closed_401(client, monkeypatch):
    monkeypatch.setattr(mod, "load_bot_runner_config", lambda: {"dummy": True})

    def verify(_t, _c):
        raise RuntimeError("boom")

    monkeypatch.setattr(mod, "verify_bot_runner_token", verify)

    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid bot runner token"
