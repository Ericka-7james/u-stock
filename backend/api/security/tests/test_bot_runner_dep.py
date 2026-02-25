# backend/api/security/tests/test_bot_runner_dep.py
from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
import jwt
import pytest

import api.security.bot_runner_dep as dep


@pytest.fixture()
def client(monkeypatch):
    # Ensure decode path doesn't 500 due to missing signing key
    monkeypatch.setenv("RUNNER_JWT_SIGNING_KEY", "sek")
    monkeypatch.setenv("RUNNER_JWT_ISSUER", "ustock-backend")
    monkeypatch.setenv("RUNNER_JWT_AUDIENCE", "ustock-runner")

    app = FastAPI()

    @app.get("/protected")
    def protected(runner_id: str = Depends(dep.require_bot_runner)):
        return {"ok": True, "runner_id": runner_id}

    return TestClient(app)


def test_missing_authorization_header_returns_401(client):
    resp = client.get("/protected")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Runner token missing"


def test_wrong_prefix_returns_401(client):
    resp = client.get("/protected", headers={"Authorization": "Token abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Runner token missing"


def test_bearer_with_empty_token_returns_401(client):
    resp = client.get("/protected", headers={"Authorization": "Bearer   "})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Runner token missing"


def test_expired_signature_returns_401(client, monkeypatch):
    monkeypatch.setattr(dep.jwt, "decode", lambda *a, **k: (_ for _ in ()).throw(jwt.ExpiredSignatureError()))
    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Runner token expired"


def test_invalid_token_error_returns_401_with_message(client, monkeypatch):
    monkeypatch.setattr(dep.jwt, "decode", lambda *a, **k: (_ for _ in ()).throw(jwt.InvalidTokenError()))
    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid runner token"


def test_missing_subject_returns_401(client, monkeypatch):
    monkeypatch.setattr(dep.jwt, "decode", lambda *a, **k: {"sub": "   "})
    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid runner token"


def test_success_returns_user_id(client, monkeypatch):
    monkeypatch.setattr(dep.jwt, "decode", lambda *a, **k: {"sub": "user-123"})
    resp = client.get("/protected", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 200
    assert resp.json()["runner_id"] == "user-123"


def test_unexpected_exception_fails_closed_401(client, monkeypatch):
    monkeypatch.setattr(dep.jwt, "decode", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    resp = client.get("/protected", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid runner token"