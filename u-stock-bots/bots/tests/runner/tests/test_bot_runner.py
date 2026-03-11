# u-stock-bots/runner/tests/test_bot_runner.py
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
import jwt
import pytest


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _get_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return None


def _decode_runner_jwt(token: str) -> Dict[str, Any]:
    key = _env("RUNNER_JWT_SIGNING_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="RUNNER_JWT_SIGNING_KEY not configured")

    issuer = _env("RUNNER_JWT_ISSUER", "ustock-backend")
    audience = _env("RUNNER_JWT_AUDIENCE", "ustock-runner")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256"],
            issuer=issuer,
            audience=audience,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )
        if not isinstance(claims, dict):
            raise HTTPException(status_code=401, detail="Invalid runner token")
        return claims

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Runner token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid runner token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid runner token")


def require_bot_runner(request: Request) -> str:
    token = _get_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Runner token missing")

    claims = _decode_runner_jwt(token)

    runner_id = str(claims.get("sub") or "").strip()
    if not runner_id:
        raise HTTPException(status_code=401, detail="Invalid runner token")

    return runner_id


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("RUNNER_JWT_SIGNING_KEY", "sek")
    monkeypatch.setenv("RUNNER_JWT_ISSUER", "ustock-backend")
    monkeypatch.setenv("RUNNER_JWT_AUDIENCE", "ustock-runner")

    app = FastAPI()

    @app.get("/protected")
    def protected(runner_id: str = Depends(require_bot_runner)):
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
    monkeypatch.setattr(jwt, "decode", lambda *a, **k: (_ for _ in ()).throw(jwt.ExpiredSignatureError()))
    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Runner token expired"


def test_invalid_token_error_returns_401(client, monkeypatch):
    monkeypatch.setattr(jwt, "decode", lambda *a, **k: (_ for _ in ()).throw(jwt.InvalidTokenError()))
    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid runner token"


def test_missing_subject_returns_401(client, monkeypatch):
    monkeypatch.setattr(jwt, "decode", lambda *a, **k: {"sub": "   "})
    resp = client.get("/protected", headers={"Authorization": "Bearer abc"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid runner token"


def test_success_returns_user_id(client, monkeypatch):
    monkeypatch.setattr(jwt, "decode", lambda *a, **k: {"sub": "user-123"})
    resp = client.get("/protected", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 200
    assert resp.json()["runner_id"] == "user-123"


def test_unexpected_exception_fails_closed_401(client, monkeypatch):
    monkeypatch.setattr(jwt, "decode", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    resp = client.get("/protected", headers={"Authorization": "Bearer good"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid runner token"