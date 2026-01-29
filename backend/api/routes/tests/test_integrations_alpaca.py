# backend/api/routes/tests/test_integrations_alpaca.py
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

import api.routes.integrations_alpaca as mod


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
        self._select_cols = None
        self._filters = []
        self._limit = None
        self._is_maybe_single = False

    def select(self, cols):
        self._select_cols = cols
        return self

    def eq(self, k, v):
        self._filters.append((k, v))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def maybe_single(self):
        self._is_maybe_single = True
        self._sb.calls.append(("maybe_single", self._table, tuple(self._filters)))
        return self

    def upsert(self, payload, on_conflict=None):
        self._sb.calls.append(("upsert", self._table, payload, on_conflict))
        if self._sb.fail_upsert:
            raise RuntimeError("upsert failed")
        return self

    def update(self, payload):
        self._sb.calls.append(("update", self._table, payload))
        if self._sb.fail_update:
            raise RuntimeError("update failed")
        return self

    def insert(self, payload):
        self._sb.calls.append(("insert", self._table, payload))
        if self._sb.fail_insert:
            raise RuntimeError("insert failed")
        return self

    def execute(self):
        self._sb.calls.append(("execute", self._table, tuple(self._filters), self._select_cols, self._limit))

        # fallback existing check
        if self._is_maybe_single:
            return _ExecResult(data=self._sb.existing_data)

        # creds route select result
        if self._select_cols == "status,mode,api_key_enc,api_secret_enc":
            return _ExecResult(data=self._sb.select_data)

        return _ExecResult(data=None)


class FakeSupabase:
    def __init__(self):
        self.calls = []
        self.fail_upsert = False
        self.fail_update = False
        self.fail_insert = False
        self.select_data = []     # used for /creds
        self.existing_data = None # used for fallback

    def table(self, name):
        self.calls.append(("table", name))
        return FakeQuery(name, self)


@pytest.fixture()
def app():
    app = FastAPI()
    app.include_router(mod.router)
    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


# -------------------------
# /keys tests
# -------------------------
def test_save_keys_success_uses_upsert(client, monkeypatch):
    sb = FakeSupabase()

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "encrypt_secret", lambda s: f"enc({s})")
    monkeypatch.setattr(mod, "require_user", lambda request, response: {"id": "user-123"})

    resp = client.post(
        "/integrations/alpaca/keys",
        json={"api_key": "AK12345", "api_secret": "SK12345", "mode": "paper"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "provider": "alpaca", "status": "connected", "mode": "paper"}

    upserts = [c for c in sb.calls if c[0] == "upsert"]
    assert len(upserts) == 1
    _, table, payload, on_conflict = upserts[0]
    assert table == "integrations"
    assert payload["user_id"] == "user-123"
    assert payload["provider"] == "alpaca"
    assert payload["status"] == "connected"
    assert payload["mode"] == "paper"
    assert payload["api_key_enc"] == "enc(AK12345)"
    assert payload["api_secret_enc"] == "enc(SK12345)"
    assert on_conflict == "user_id,provider"


def test_save_keys_invalid_mode_returns_422(client, monkeypatch):
    sb = FakeSupabase()

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "encrypt_secret", lambda s: f"enc({s})")
    monkeypatch.setattr(mod, "require_user", lambda request, response: {"id": "user-123"})

    resp = client.post(
        "/integrations/alpaca/keys",
        json={"api_key": "AK12345", "api_secret": "SK12345", "mode": "weird"},
    )
    assert resp.status_code == 422


def test_save_keys_blank_after_strip_returns_400(client, monkeypatch):
    sb = FakeSupabase()
    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "encrypt_secret", lambda s: f"enc({s})")
    monkeypatch.setattr(mod, "require_user", lambda request, response: {"id": "user-123"})

    resp = client.post(
        "/integrations/alpaca/keys",
        json={"api_key": "     ", "api_secret": "     ", "mode": "paper"},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["code"] == "ALPACA_KEYS_MISSING"
    assert detail["provider"] == "alpaca"


def test_save_keys_upsert_fails_then_updates_when_existing(client, monkeypatch):
    sb = FakeSupabase()
    sb.fail_upsert = True
    sb.existing_data = {"user_id": "user-123"}  # truthy => update path

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "encrypt_secret", lambda s: f"enc({s})")
    monkeypatch.setattr(mod, "require_user", lambda request, response: {"id": "user-123"})

    resp = client.post(
        "/integrations/alpaca/keys",
        json={"api_key": "AK12345", "api_secret": "SK12345", "mode": "paper"},
    )
    assert resp.status_code == 200

    assert any(c[0] == "update" for c in sb.calls)
    assert not any(c[0] == "insert" for c in sb.calls)
    assert any(c[0] == "maybe_single" for c in sb.calls)


def test_save_keys_upsert_fails_then_inserts_when_missing(client, monkeypatch):
    sb = FakeSupabase()
    sb.fail_upsert = True
    sb.existing_data = None  # falsy => insert path

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "encrypt_secret", lambda s: f"enc({s})")
    monkeypatch.setattr(mod, "require_user", lambda request, response: {"id": "user-123"})

    resp = client.post(
        "/integrations/alpaca/keys",
        json={"api_key": "AK12345", "api_secret": "SK12345", "mode": "paper"},
    )
    assert resp.status_code == 200
    assert any(c[0] == "insert" for c in sb.calls)


# -------------------------
# /creds tests
# -------------------------
def test_get_creds_returns_not_connected_when_no_row(app, monkeypatch):
    sb = FakeSupabase()
    sb.select_data = []

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: f"dec({s})")

    app.dependency_overrides[mod.require_bot_runner] = lambda: "user-123"
    client = TestClient(app)

    resp = client.get("/integrations/alpaca/creds")
    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "provider": "alpaca",
        "status": "not_connected",
        "mode": "paper",
        "api_key": None,
        "api_secret": None,
    }


def test_get_creds_returns_not_connected_when_status_not_connected(app, monkeypatch):
    sb = FakeSupabase()
    sb.select_data = [{"status": "paused", "mode": "paper", "api_key_enc": "X", "api_secret_enc": "Y"}]

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: f"dec({s})")  # should NOT be used

    app.dependency_overrides[mod.require_bot_runner] = lambda: "user-123"
    client = TestClient(app)

    resp = client.get("/integrations/alpaca/creds")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "not_connected"
    assert body["api_key"] is None
    assert body["api_secret"] is None


def test_get_creds_returns_decrypted_secrets_when_connected(app, monkeypatch):
    sb = FakeSupabase()
    sb.select_data = [{"status": "connected", "mode": "live", "api_key_enc": "ENC_K", "api_secret_enc": "ENC_S"}]

    monkeypatch.setattr(mod, "get_supabase_service", lambda: sb)
    monkeypatch.setattr(mod, "decrypt_secret", lambda s: f"dec({s})")

    app.dependency_overrides[mod.require_bot_runner] = lambda: "user-123"
    client = TestClient(app)

    resp = client.get("/integrations/alpaca/creds")
    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "provider": "alpaca",
        "status": "connected",
        "mode": "live",
        "api_key": "dec(ENC_K)",
        "api_secret": "dec(ENC_S)",
    }


def test_get_creds_returns_500_when_supabase_select_errors(app, monkeypatch):
    class BadSB(FakeSupabase):
        def table(self, name):
            raise RuntimeError("db down")

    monkeypatch.setattr(mod, "get_supabase_service", lambda: BadSB())
    app.dependency_overrides[mod.require_bot_runner] = lambda: "user-123"
    client = TestClient(app)

    resp = client.get("/integrations/alpaca/creds")
    assert resp.status_code == 500
    detail = resp.json()["detail"]
    assert detail["code"] == "INTEGRATION_LOAD_FAILED"
    assert "Failed to load Alpaca integration" in detail["message"]
