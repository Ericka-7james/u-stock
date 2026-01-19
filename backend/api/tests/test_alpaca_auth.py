# api/tests/test_alpaca_auth.py
from __future__ import annotations

import pytest
from fastapi import HTTPException

import api.alpaca_auth as mod


# -------------------------
# Fakes
# -------------------------
class _ExecResult:
    def __init__(self, data=None):
        self.data = data


class FakeQuery:
    def __init__(self, table, sb):
        self._table = table
        self._sb = sb
        self._filters = []
        self._select_cols = None
        self._limit = None

    def select(self, cols):
        self._select_cols = cols
        return self

    def eq(self, k, v):
        self._filters.append((k, v))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        self._sb.calls.append(("execute", self._table, self._select_cols, tuple(self._filters), self._limit))
        return _ExecResult(data=self._sb.data)


class FakeSupabase:
    def __init__(self, data=None, fail=False):
        self.data = data or []
        self.fail = fail
        self.calls = []

    def table(self, name):
        self.calls.append(("table", name))
        if self.fail:
            raise RuntimeError("db down")
        return FakeQuery(name, self)


@pytest.fixture(autouse=True)
def clear_site_env(monkeypatch):
    # Ensure env doesn't leak between tests
    monkeypatch.delenv("ALPACA_API_KEY", raising=False)
    monkeypatch.delenv("ALPACA_API_SECRET", raising=False)
    monkeypatch.delenv("ALPACA_MODE", raising=False)
    yield
    monkeypatch.delenv("ALPACA_API_KEY", raising=False)
    monkeypatch.delenv("ALPACA_API_SECRET", raising=False)
    monkeypatch.delenv("ALPACA_MODE", raising=False)


def test_site_owned_env_keys_take_priority(monkeypatch):
    monkeypatch.setenv("ALPACA_API_KEY", "SITEKEY")
    monkeypatch.setenv("ALPACA_API_SECRET", "SITESECRET")
    monkeypatch.setenv("ALPACA_MODE", "live")

    # even if user_id missing, env should work
    k, s, mode = mod.get_alpaca_credentials(None)
    assert (k, s, mode) == ("SITEKEY", "SITESECRET", "live")


def test_site_owned_env_invalid_mode_defaults_to_paper(monkeypatch):
    monkeypatch.setenv("ALPACA_API_KEY", "SITEKEY")
    monkeypatch.setenv("ALPACA_API_SECRET", "SITESECRET")
    monkeypatch.setenv("ALPACA_MODE", "weird")

    k, s, mode = mod.get_alpaca_credentials("user-123")
    assert (k, s, mode) == ("SITEKEY", "SITESECRET", "paper")


def test_user_owned_requires_auth_when_no_site_env(monkeypatch):
    with pytest.raises(HTTPException) as e:
        mod.get_alpaca_credentials(None)
    assert e.value.status_code == 401
    assert e.value.detail == "Not authenticated."


def test_user_owned_not_connected_returns_400(monkeypatch):
    sb = FakeSupabase(data=[{"status": "paused"}])
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)

    with pytest.raises(HTTPException) as e:
        mod.get_alpaca_credentials("user-123")
    assert e.value.status_code == 400
    assert e.value.detail == "Alpaca is not connected."


def test_user_owned_missing_row_returns_400(monkeypatch):
    sb = FakeSupabase(data=[])
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)

    with pytest.raises(HTTPException) as e:
        mod.get_alpaca_credentials("user-123")
    assert e.value.status_code == 400
    assert e.value.detail == "Alpaca is not connected."


def test_user_owned_decrypt_failure_returns_500(monkeypatch):
    sb = FakeSupabase(
        data=[{"status": "connected", "api_key_enc": "K", "api_secret_enc": "S", "mode": "paper"}]
    )
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda _x: None)

    with pytest.raises(HTTPException) as e:
        mod.get_alpaca_credentials("user-123")
    assert e.value.status_code == 500
    assert "missing or not decryptable" in e.value.detail


def test_user_owned_invalid_mode_defaults_to_paper(monkeypatch):
    sb = FakeSupabase(
        data=[{"status": "connected", "api_key_enc": "K", "api_secret_enc": "S", "mode": "nope"}]
    )
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    k, s, mode = mod.get_alpaca_credentials("user-123")
    assert (k, s, mode) == ("dec(K)", "dec(S)", "paper")


def test_user_owned_success(monkeypatch):
    sb = FakeSupabase(
        data=[{"status": "connected", "api_key_enc": "K", "api_secret_enc": "S", "mode": "live"}]
    )
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda x: f"dec({x})")

    k, s, mode = mod.get_alpaca_credentials("user-123")
    assert (k, s, mode) == ("dec(K)", "dec(S)", "live")

    # sanity: query was made against integrations with correct filters
    assert ("table", "integrations") in sb.calls


def test_db_failure_returns_500(monkeypatch):
    sb = FakeSupabase(fail=True)
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)

    with pytest.raises(HTTPException) as e:
        mod.get_alpaca_credentials("user-123")
    assert e.value.status_code == 500
    assert "Failed to load Alpaca integration" in e.value.detail


def test_alpaca_headers_shape():
    h = mod.alpaca_headers("K", "S")
    assert h == {"APCA-API-KEY-ID": "K", "APCA-API-SECRET-KEY": "S"}
