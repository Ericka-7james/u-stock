# backend/api/tests/test_cron.py
from __future__ import annotations

import os
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.cron as mod


@pytest.fixture()
def app(monkeypatch):
    app = FastAPI()
    app.include_router(mod.router)

    # Ensure deterministic env for auth
    monkeypatch.setenv("PIPELINE_SECRET", "secret-123")
    return app


@pytest.fixture()
def client(app):
    return TestClient(app)


def test_market_snapshot_401_when_secret_missing(client, monkeypatch):
    monkeypatch.setenv("PIPELINE_SECRET", "")
    resp = client.post(
        "/cron/market-snapshot",
        headers={"content-type": "application/json", "x-pipeline-secret": "secret-123"},
        json={},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "unauthorized"


def test_market_snapshot_401_when_secret_wrong(client):
    resp = client.post(
        "/cron/market-snapshot",
        headers={"content-type": "application/json", "x-pipeline-secret": "nope"},
        json={},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "unauthorized"


def test_market_snapshot_415_when_not_json_content_type(client):
    resp = client.post(
        "/cron/market-snapshot",
        headers={"x-pipeline-secret": "secret-123", "content-type": "text/plain"},
        data="hi",
    )
    assert resp.status_code == 415
    assert "Unsupported Media Type" in resp.json()["detail"]


def test_market_snapshot_400_when_json_not_object(client):
    # JSON array is valid json but not the shape we accept
    resp = client.post(
        "/cron/market-snapshot",
        headers={"x-pipeline-secret": "secret-123", "content-type": "application/json"},
        json=[1, 2, 3],
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "JSON body must be an object"


def test_market_snapshot_success_runs_all_steps(client, monkeypatch):
    calls = []

    def fake_run(cmd):
        calls.append(cmd)
        return {
            "cmd": cmd,
            "returncode": 0,
            "stdout": "",
            "stderr": "",
            "PYTHONPATH": "x",
            "timed_out": False,
            "duration_ms": 5,
        }

    monkeypatch.setattr(mod, "_run", fake_run)

    resp = client.post(
        "/cron/market-snapshot",
        headers={"x-pipeline-secret": "secret-123", "content-type": "application/json"},
        json={},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["status"] == "success"
    assert body["job"] == "market-snapshot"
    assert isinstance(body["steps"], list)
    assert len(body["steps"]) == 5
    assert len(calls) == 5
    assert "meta" in body
    assert "startedAt" in body["meta"]
    assert "finishedAt" in body["meta"]


def test_market_snapshot_failure_returns_failed_step_and_stops(client, monkeypatch):
    calls = []

    def fake_run(cmd):
        calls.append(cmd)
        # fail on the 3rd command
        if len(calls) == 3:
            return {
                "cmd": cmd,
                "returncode": 2,
                "stdout": "oops",
                "stderr": "bad",
                "PYTHONPATH": "x",
                "timed_out": False,
                "duration_ms": 10,
            }
        return {
            "cmd": cmd,
            "returncode": 0,
            "stdout": "",
            "stderr": "",
            "PYTHONPATH": "x",
            "timed_out": False,
            "duration_ms": 5,
        }

    monkeypatch.setattr(mod, "_run", fake_run)

    resp = client.post(
        "/cron/market-snapshot",
        headers={"x-pipeline-secret": "secret-123", "content-type": "application/json"},
        json={},
    )

    assert resp.status_code == 200  # route returns ok:false payload instead of HTTP error
    body = resp.json()
    assert body["ok"] is False
    assert body["status"] == "failure"
    assert body["failed_step"] == calls[2]
    assert len(body["steps"]) == 3  # stopped early
    assert body["steps"][-1]["returncode"] == 2
    assert "meta" in body
