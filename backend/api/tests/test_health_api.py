import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.routes.health as mod


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_health_defaults_to_development(monkeypatch, client):
    monkeypatch.delenv("ENV", raising=False)

    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "env": "development"}


def test_health_env_is_lower_stripped(monkeypatch, client):
    monkeypatch.setenv("ENV", "  PRODUCTION  ")

    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["env"] == "production"


def test_market_snapshot_health_returns_missing_when_file_absent(monkeypatch, client, tmp_path: Path):
    monkeypatch.setattr(mod, "_backend_root", lambda: tmp_path)

    resp = client.get("/api/health/market-snapshot")
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["status"] == "missing"
    assert "health file not found yet" in data["error"]
    assert "market-snapshot-health.json" in data["path"]


def test_market_snapshot_health_returns_json_when_file_exists(monkeypatch, client, tmp_path: Path):
    monkeypatch.setattr(mod, "_backend_root", lambda: tmp_path)

    p = tmp_path / "public" / "data" / "fetched" / "market-snapshot-health.json"
    p.parent.mkdir(parents=True, exist_ok=True)

    payload = {"ok": True, "status": "success", "job": "market-snapshot"}
    p.write_text(json.dumps(payload), encoding="utf-8")

    resp = client.get("/api/health/market-snapshot")
    assert resp.status_code == 200
    assert resp.json() == payload


def test_market_snapshot_health_500_when_json_invalid(monkeypatch, client, tmp_path: Path):
    monkeypatch.setattr(mod, "_backend_root", lambda: tmp_path)

    p = tmp_path / "public" / "data" / "fetched" / "market-snapshot-health.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("{ not json }", encoding="utf-8")

    resp = client.get("/api/health/market-snapshot")
    assert resp.status_code == 500
    assert "Failed to read health file" in resp.json()["detail"]
