# backend/api/tests/test_deps.py
from __future__ import annotations

import types

import pytest
from fastapi import FastAPI, Request, Response
from fastapi.testclient import TestClient

import api.deps as mod


class FakeAuth:
    def __init__(self):
        self.calls = []
        self.result = None
        self.raise_exc = None

    def get_user(self, token: str):
        self.calls.append(token)
        if self.raise_exc:
            raise self.raise_exc
        return self.result


class FakeSupabase:
    def __init__(self):
        self.auth = FakeAuth()


def _make_app_for_dep(dep_func):
    app = FastAPI()

    @app.get("/probe")
    def probe(request: Request, response: Response):
        u = dep_func(request, response)
        return {"ok": True, "user": u}

    return TestClient(app)


def test_require_user_401_when_no_token(monkeypatch):
    sb = FakeSupabase()
    monkeypatch.setattr(mod, "get_supabase_anon", lambda: sb)

    client = _make_app_for_dep(mod.require_user)
    resp = client.get("/probe")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"
    assert sb.auth.calls == []


def test_require_user_uses_authorization_header_over_cookie(monkeypatch):
    sb = FakeSupabase()
    sb.auth.result = types.SimpleNamespace(user=types.SimpleNamespace(id="user-123", email="a@b.com"))
    monkeypatch.setattr(mod, "get_supabase_anon", lambda: sb)

    client = _make_app_for_dep(mod.require_user)
    resp = client.get(
        "/probe",
        headers={"Authorization": "Bearer header-token"},
        cookies={"access_token": "cookie-token"},
    )
    assert resp.status_code == 200
    assert sb.auth.calls == ["header-token"]
    assert resp.json()["user"]["id"] == "user-123"
    assert resp.json()["user"]["email"] == "a@b.com"


def test_require_user_reads_token_from_cookie(monkeypatch):
    sb = FakeSupabase()
    sb.auth.result = types.SimpleNamespace(user=types.SimpleNamespace(id="user-123", email="a@b.com"))
    monkeypatch.setattr(mod, "get_supabase_anon", lambda: sb)

    client = _make_app_for_dep(mod.require_user)
    resp = client.get("/probe", cookies={"sb-access-token": "cookie-token"})
    assert resp.status_code == 200
    assert sb.auth.calls == ["cookie-token"]
    assert resp.json()["user"]["id"] == "user-123"
    assert resp.json()["user"]["email"] == "a@b.com"


def test_require_user_401_on_invalid_session_token(monkeypatch):
    sb = FakeSupabase()
    sb.auth.raise_exc = RuntimeError("boom")
    monkeypatch.setattr(mod, "get_supabase_anon", lambda: sb)

    client = _make_app_for_dep(mod.require_user)
    resp = client.get("/probe", headers={"Authorization": "Bearer bad"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Invalid session token"


def test_require_user_accepts_dict_shape(monkeypatch):
    sb = FakeSupabase()
    sb.auth.result = {"user": {"id": "user-999", "email": "x@y.com"}}
    monkeypatch.setattr(mod, "get_supabase_anon", lambda: sb)

    client = _make_app_for_dep(mod.require_user)
    resp = client.get("/probe", headers={"Authorization": "Bearer tok"})
    assert resp.status_code == 200
    assert resp.json()["user"]["id"] == "user-999"
    assert resp.json()["user"]["email"] == "x@y.com"


def test_require_user_401_when_user_missing_or_id_missing(monkeypatch):
    sb = FakeSupabase()
    sb.auth.result = {"user": {"email": "x@y.com"}}  # missing id
    monkeypatch.setattr(mod, "get_supabase_anon", lambda: sb)

    client = _make_app_for_dep(mod.require_user)
    resp = client.get("/probe", headers={"Authorization": "Bearer tok"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Not authenticated"


def test_require_runner_500_when_secret_not_configured(monkeypatch):
    monkeypatch.delenv(mod.RUNNER_SECRET_ENV, raising=False)

    client = _make_app_for_dep(mod.require_runner)
    resp = client.get(
        "/probe",
        headers={mod.RUNNER_SECRET_HEADER: "x", mod.RUNNER_USER_ID_HEADER: "user-1"},
    )
    assert resp.status_code == 500
    assert resp.json()["detail"] == "BOT_RUNNER_SECRET not configured"


def test_require_runner_401_when_secret_wrong(monkeypatch):
    monkeypatch.setenv(mod.RUNNER_SECRET_ENV, "expected")

    client = _make_app_for_dep(mod.require_runner)
    resp = client.get(
        "/probe",
        headers={mod.RUNNER_SECRET_HEADER: "wrong", mod.RUNNER_USER_ID_HEADER: "user-1"},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Runner not authenticated"


def test_require_runner_401_when_user_id_header_missing(monkeypatch):
    monkeypatch.setenv(mod.RUNNER_SECRET_ENV, "expected")

    client = _make_app_for_dep(mod.require_runner)
    resp = client.get("/probe", headers={mod.RUNNER_SECRET_HEADER: "expected"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Runner missing user_id header"


def test_require_runner_accepts_primary_user_id_header(monkeypatch):
    monkeypatch.setenv(mod.RUNNER_SECRET_ENV, "expected")

    client = _make_app_for_dep(mod.require_runner)
    resp = client.get(
        "/probe",
        headers={mod.RUNNER_SECRET_HEADER: "expected", mod.RUNNER_USER_ID_HEADER: "user-abc"},
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["id"] == "user-abc"
    assert resp.json()["user"]["auth"] == "runner"
    assert resp.json()["user"]["email"] is None


def test_require_runner_accepts_alt_user_id_header(monkeypatch):
    monkeypatch.setenv(mod.RUNNER_SECRET_ENV, "expected")

    client = _make_app_for_dep(mod.require_runner)
    resp = client.get(
        "/probe",
        headers={mod.RUNNER_SECRET_HEADER: "expected", mod.RUNNER_USER_ID_HEADER_ALT: "user-alt"},
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["id"] == "user-alt"
    assert resp.json()["user"]["auth"] == "runner"


def test_require_user_or_runner_prefers_runner_when_runner_header_present(monkeypatch):
    monkeypatch.setenv(mod.RUNNER_SECRET_ENV, "expected")

    client = _make_app_for_dep(mod.require_user_or_runner)
    resp = client.get(
        "/probe",
        headers={mod.RUNNER_SECRET_HEADER: "expected", mod.RUNNER_USER_ID_HEADER: "runner-user"},
    )
    assert resp.status_code == 200
    assert resp.json()["user"]["auth"] == "runner"
    assert resp.json()["user"]["id"] == "runner-user"