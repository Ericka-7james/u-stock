# api/lib/tests/test_alpaca_user_creds.py
import importlib
import sys
from typing import Any, Dict, Optional

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import Response


def _make_request_with_cookies(cookies: dict) -> Request:
    scope = {"type": "http", "method": "GET", "path": "/", "headers": []}
    req = Request(scope)
    cookie_header = "; ".join([f"{k}={v}" for k, v in cookies.items()])
    req.scope["headers"] = [(b"cookie", cookie_header.encode("latin-1"))]
    return req


class _FakeExecResult:
    def __init__(self, data: Optional[Dict[str, Any]]):
        self.data = data


class _FakeQuery:
    def __init__(self, data: Optional[Dict[str, Any]] = None, raise_on_execute: Exception | None = None):
        self._data = data
        self._raise = raise_on_execute
        self.table_name = None
        self.selected = None
        self.filters = []

    def select(self, fields: str):
        self.selected = fields
        return self

    def eq(self, col: str, value: Any):
        self.filters.append((col, value))
        return self

    def maybe_single(self):
        return self

    def execute(self):
        if self._raise:
            raise self._raise
        return _FakeExecResult(self._data)


class _FakeSBService:
    def __init__(self, data: Optional[Dict[str, Any]] = None, raise_on_execute: Exception | None = None):
        self._query = _FakeQuery(data=data, raise_on_execute=raise_on_execute)

    def table(self, name: str):
        self._query.table_name = name
        return self._query


@pytest.fixture
def mod():
    if "api.lib.alpaca_user_creds" in sys.modules:
        return importlib.reload(sys.modules["api.lib.alpaca_user_creds"])
    return importlib.import_module("api.lib.alpaca_user_creds")


def test_happy_path_connected_returns_creds(mod, monkeypatch):
    # Patch the imported names in the module under test
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})
    monkeypatch.setattr(mod, "decrypt_secret", lambda v: "AK" if "key" in (v or "") else "SK")

    sb = _FakeSBService(
        data={
            "status": "connected",
            "api_key_enc": "enc_key",
            "api_secret_enc": "enc_secret",
            "mode": "PAPER",
        }
    )

    req = _make_request_with_cookies({})
    resp = Response()

    api_key, api_secret, mode = mod.get_user_alpaca_creds(req, resp, sb)

    assert api_key == "AK"
    assert api_secret == "SK"
    assert mode == "paper"


def test_not_connected_raises_400(mod, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})
    monkeypatch.setattr(mod, "decrypt_secret", lambda v: "whatever")

    sb = _FakeSBService(data={"status": "disconnected"})
    with pytest.raises(HTTPException) as e:
        mod.get_user_alpaca_creds(_make_request_with_cookies({}), Response(), sb)

    assert e.value.status_code == 400
    assert "Alpaca is not connected" in str(e.value.detail)


def test_missing_row_raises_400(mod, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})
    monkeypatch.setattr(mod, "decrypt_secret", lambda v: "whatever")

    sb = _FakeSBService(data=None)
    with pytest.raises(HTTPException) as e:
        mod.get_user_alpaca_creds(_make_request_with_cookies({}), Response(), sb)

    assert e.value.status_code == 400


def test_missing_keys_after_decrypt_raises_400(mod, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})
    monkeypatch.setattr(mod, "decrypt_secret", lambda v: None)

    sb = _FakeSBService(
        data={
            "status": "connected",
            "api_key_enc": "enc_key",
            "api_secret_enc": "enc_secret",
            "mode": "paper",
        }
    )

    with pytest.raises(HTTPException) as e:
        mod.get_user_alpaca_creds(_make_request_with_cookies({}), Response(), sb)

    assert e.value.status_code == 400
    assert "keys missing" in str(e.value.detail).lower()


def test_invalid_mode_defaults_to_paper(mod, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})
    monkeypatch.setattr(mod, "decrypt_secret", lambda v: "OK")

    sb = _FakeSBService(
        data={
            "status": "connected",
            "api_key_enc": "enc_key",
            "api_secret_enc": "enc_secret",
            "mode": "demo",
        }
    )

    _, _, mode = mod.get_user_alpaca_creds(_make_request_with_cookies({}), Response(), sb)
    assert mode == "paper"


def test_supabase_execute_exception_raises_500(mod, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})
    monkeypatch.setattr(mod, "decrypt_secret", lambda v: "OK")

    sb = _FakeSBService(raise_on_execute=Exception("DB down"))

    with pytest.raises(HTTPException) as e:
        mod.get_user_alpaca_creds(_make_request_with_cookies({}), Response(), sb)

    assert e.value.status_code == 500
    assert "Failed to load Alpaca integration" in str(e.value.detail)
