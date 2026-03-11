# api/core/tests/test_security.py
import importlib
import sys
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response


def _reload_security():
    if "api.core.security" in sys.modules:
        return importlib.reload(sys.modules["api.core.security"])
    return importlib.import_module("api.core.security")


@pytest.fixture
def clean_env(monkeypatch):
    for k in [
        "ENV",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_SECRET_KEY",
        "INTEGRATIONS_ENC_KEY",
        "USTOCK_COOKIE_NAME",
        "USTOCK_REFRESH_COOKIE_NAME",
        "USTOCK_COOKIE_MAX_AGE",
    ]:
        monkeypatch.delenv(k, raising=False)
    yield


@pytest.fixture
def security_mod(clean_env):
    sec = _reload_security()
    # clear cached clients between tests
    sec.get_supabase_anon.cache_clear()
    sec.get_supabase_service.cache_clear()
    return sec


class _FakeAuth:
    def __init__(self, get_user_result=None, get_user_raises=False, refresh_result=None, refresh_raises=False):
        self._get_user_result = get_user_result
        self._get_user_raises = get_user_raises
        self._refresh_result = refresh_result
        self._refresh_raises = refresh_raises

    def get_user(self, access):
        if self._get_user_raises:
            raise Exception("bad access")
        return self._get_user_result

    def refresh_session(self, refresh):
        if self._refresh_raises:
            raise Exception("bad refresh")
        return self._refresh_result


class _FakeSB:
    def __init__(self, auth: _FakeAuth):
        self.auth = auth


def _make_request_with_cookies(cookies: dict) -> Request:
    scope = {"type": "http", "method": "GET", "path": "/", "headers": []}
    req = Request(scope)
    # Starlette Request.cookies comes from headers; easiest is to set Cookie header.
    cookie_header = "; ".join([f"{k}={v}" for k, v in cookies.items()])
    req.scope["headers"] = [(b"cookie", cookie_header.encode("latin-1"))]
    return req


def test_get_supabase_anon_missing_env_raises_500(security_mod, monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)

    with pytest.raises(HTTPException) as e:
        security_mod.get_supabase_anon()

    assert e.value.status_code == 500
    assert e.value.detail["code"] == "SUPABASE_MISCONFIGURED"


def test_get_supabase_anon_invalid_key_wraps(security_mod, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "bad")

    def _boom(url, key):
        raise Exception("Invalid API key")

    monkeypatch.setattr(security_mod, "create_client", _boom)

    with pytest.raises(HTTPException) as e:
        security_mod.get_supabase_anon()

    assert e.value.status_code == 500
    assert e.value.detail["code"] == "SUPABASE_INVALID_KEY"


def test_require_user_access_token_success(security_mod, monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    monkeypatch.setenv("USTOCK_COOKIE_NAME", "access_token")
    monkeypatch.setenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token")

    fake_sb = _FakeSB(
        auth=_FakeAuth(get_user_result={"user": {"id": "u1", "email": "a@b.com"}})
    )

    monkeypatch.setattr(security_mod, "get_supabase_anon", lambda: fake_sb)

    req = _make_request_with_cookies({"access_token": "ACCESS123"})
    resp = Response()

    user = security_mod.require_user(req, resp)
    assert user == {"id": "u1", "email": "a@b.com"}


def test_require_user_refresh_sets_cookies(security_mod, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon")
    monkeypatch.setenv("USTOCK_COOKIE_NAME", "access_token")
    monkeypatch.setenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token")

    refreshed = {
        "user": {"id": "u2", "email": "x@y.com"},
        "session": {"access_token": "NEW_ACCESS", "refresh_token": "NEW_REFRESH"},
    }

    fake_sb = _FakeSB(
        auth=_FakeAuth(get_user_raises=True, refresh_result=refreshed)
    )

    monkeypatch.setattr(security_mod, "get_supabase_anon", lambda: fake_sb)

    req = _make_request_with_cookies({"refresh_token": "REFRESH123"})
    resp = Response()

    user = security_mod.require_user(req, resp)
    assert user == {"id": "u2", "email": "x@y.com"}

    set_cookies = resp.headers.getlist("set-cookie")
    # should set access + refresh cookies
    assert any("access_token=NEW_ACCESS" in c for c in set_cookies)
    assert any("refresh_token=NEW_REFRESH" in c for c in set_cookies)


def test_decrypt_secret_missing_key_raises(security_mod, monkeypatch):
    monkeypatch.delenv("INTEGRATIONS_ENC_KEY", raising=False)
    with pytest.raises(HTTPException) as e:
        security_mod.decrypt_secret("anything")
    assert e.value.status_code == 500
    assert e.value.detail["code"] == "INTEGRATIONS_ENC_KEY_MISSING"


def test_decrypt_secret_roundtrip(security_mod, monkeypatch):
    key = Fernet.generate_key().decode("utf-8")
    monkeypatch.setenv("INTEGRATIONS_ENC_KEY", key)

    f = Fernet(key.encode("utf-8"))
    token = f.encrypt(b"supersecret").decode("utf-8")

    assert security_mod.decrypt_secret(token) == "supersecret"
    assert security_mod.decrypt_secret(None) is None
