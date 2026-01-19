# backend/api/routes/tests/test_health.py
from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.routes.health as mod


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_health_defaults_to_development(monkeypatch, client: TestClient):
    monkeypatch.delenv("ENV", raising=False)

    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "env": "development"}


def test_health_env_is_lower_stripped(monkeypatch, client: TestClient):
    monkeypatch.setenv("ENV", "  PRODUCTION  ")

    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["env"] == "production"


def test_market_snapshot_health_returns_missing_when_file_absent(monkeypatch, client: TestClient, tmp_path: Path):
    # Patch backend root so we never touch real FS
    monkeypatch.setattr(mod, "_backend_root", lambda: tmp_path)

    resp = client.get("/api/health/market-snapshot")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert body["status"] == "missing"
    assert "health file not found yet" in body["error"]


def test_market_snapshot_health_returns_json_when_file_exists(monkeypatch, client: TestClient, tmp_path: Path):
    monkeypatch.setattr(mod, "_backend_root", lambda: tmp_path)

    path = tmp_path / "public" / "data" / "fetched" / "market-snapshot-health.json"
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = {"ok": True, "status": "success", "hello": "world"}
    path.write_text(json.dumps(payload), encoding="utf-8")

    resp = client.get("/api/health/market-snapshot")
    assert resp.status_code == 200
    assert resp.json() == payload


def test_market_snapshot_health_500_when_json_invalid(monkeypatch, client: TestClient, tmp_path: Path):
    monkeypatch.setattr(mod, "_backend_root", lambda: tmp_path)

    path = tmp_path / "public" / "data" / "fetched" / "market-snapshot-health.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("{not-json", encoding="utf-8")

    resp = client.get("/api/health/market-snapshot")
    assert resp.status_code == 500
    assert "Failed to read health file" in resp.json()["detail"]
