# backend/api/tests/test_index.py
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    # Ensure env behaves like test
    monkeypatch.setenv("ENV", "test")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)

    # Re-import api.index so it builds app under this env
    mod = importlib.import_module("api.index")
    importlib.reload(mod)

    return TestClient(mod.app)


def test_root_ok(client):
    resp = client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "u-stock-auth-backend"
    assert data["status"] == "running"
    assert data["env"] in ("test", "local", "development")


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_logout_ok(client):
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
