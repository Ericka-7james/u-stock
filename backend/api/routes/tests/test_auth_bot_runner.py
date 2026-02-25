# backend/api/routes/tests/test_auth_bot_runner.py

import importlib
import sys

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def mod():
    if "api.routes.auth_bot_runner" in sys.modules:
        return importlib.reload(sys.modules["api.routes.auth_bot_runner"])
    return importlib.import_module("api.routes.auth_bot_runner")


def _make_client(mod):
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def _base_env(monkeypatch):
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "shh")
    monkeypatch.setenv("RUNNER_JWT_SIGNING_KEY", "signing_key_123")
    # keep issuer/audience defaults unless test overrides


def test_mint_runner_token_success(mod, monkeypatch):
    _base_env(monkeypatch)
    monkeypatch.setenv("RUNNER_JWT_TTL_SECONDS", "600")

    client = _make_client(mod)
    res = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Runner-Secret": "shh"},
    )

    assert res.status_code == 200
    body = res.json()
    assert "token" in body
    assert body["expires_in"] == 600

    claims = jwt.decode(
        body["token"],
        "signing_key_123",
        algorithms=["HS256"],
        audience="ustock-runner",
        issuer="ustock-backend",
    )
    assert claims["sub"] == "runner_001"
    assert claims["scope"] == "runner"


def test_mint_runner_token_includes_uid_claim_when_header_provided(mod, monkeypatch):
    _base_env(monkeypatch)

    client = _make_client(mod)
    res = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Runner-Secret": "shh", "X-Runner-User-Id": "user_123"},
    )

    assert res.status_code == 200
    body = res.json()

    claims = jwt.decode(
        body["token"],
        "signing_key_123",
        algorithms=["HS256"],
        audience="ustock-runner",
        issuer="ustock-backend",
    )
    assert claims["uid"] == "user_123"


def test_mint_runner_token_500_when_shared_secret_not_configured(mod, monkeypatch):
    monkeypatch.delenv("RUNNER_SHARED_SECRET", raising=False)
    monkeypatch.delenv("BOT_RUNNER_SECRET", raising=False)
    monkeypatch.setenv("RUNNER_JWT_SIGNING_KEY", "signing_key_123")

    client = _make_client(mod)
    res = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Runner-Secret": "shh"},
    )

    assert res.status_code == 500
    assert res.json()["detail"] == "Runner shared secret not configured"


def test_mint_runner_token_401_when_secret_missing_or_wrong(mod, monkeypatch):
    _base_env(monkeypatch)
    client = _make_client(mod)

    res1 = client.post("/api/runner/token", json={"runner_id": "runner_001"})
    assert res1.status_code == 401
    assert res1.json()["detail"] == "Runner not authenticated"

    res2 = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Runner-Secret": "nope"},
    )
    assert res2.status_code == 401
    assert res2.json()["detail"] == "Runner not authenticated"


def test_mint_runner_token_500_when_signing_key_missing(mod, monkeypatch):
    monkeypatch.setenv("RUNNER_SHARED_SECRET", "shh")
    monkeypatch.delenv("RUNNER_JWT_SIGNING_KEY", raising=False)

    client = _make_client(mod)
    res = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Runner-Secret": "shh"},
    )

    assert res.status_code == 500
    assert res.json()["detail"] == "RUNNER_JWT_SIGNING_KEY not configured"


@pytest.mark.parametrize(
    "runner_id",
    [
        "",  # min_length violation
        "a" * 201,  # max_length violation
    ],
)
def test_mint_runner_token_422_on_schema_invalid_runner_id(mod, monkeypatch, runner_id):
    _base_env(monkeypatch)
    client = _make_client(mod)

    res = client.post(
        "/api/runner/token",
        json={"runner_id": runner_id},
        headers={"X-Runner-Secret": "shh"},
    )

    assert res.status_code == 422


@pytest.mark.parametrize(
    "runner_id",
    [
        " ",  # strips to empty -> handler returns 400
        "bad/runner",  # regex fail
        r"bad\runner",  # regex fail
    ],
)
def test_mint_runner_token_400_on_handler_invalid_runner_id(mod, monkeypatch, runner_id):
    _base_env(monkeypatch)
    client = _make_client(mod)

    res = client.post(
        "/api/runner/token",
        json={"runner_id": runner_id},
        headers={"X-Runner-Secret": "shh"},
    )

    assert res.status_code == 400
    assert res.json()["detail"] == "Invalid runner_id"


def test_ttl_clamps_to_min_60(mod, monkeypatch):
    _base_env(monkeypatch)
    monkeypatch.setenv("RUNNER_JWT_TTL_SECONDS", "1")

    client = _make_client(mod)
    res = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Runner-Secret": "shh"},
    )

    assert res.status_code == 200
    assert res.json()["expires_in"] == 60


def test_ttl_clamps_to_max_3600(mod, monkeypatch):
    _base_env(monkeypatch)
    monkeypatch.setenv("RUNNER_JWT_TTL_SECONDS", "999999")

    client = _make_client(mod)
    res = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Runner-Secret": "shh"},
    )

    assert res.status_code == 200
    assert res.json()["expires_in"] == 3600


def test_compat_header_and_env_names(mod, monkeypatch):
    monkeypatch.delenv("RUNNER_SHARED_SECRET", raising=False)
    monkeypatch.setenv("BOT_RUNNER_SECRET", "shh")
    monkeypatch.setenv("RUNNER_JWT_SIGNING_KEY", "signing_key_123")

    client = _make_client(mod)
    res = client.post(
        "/api/runner/token",
        json={"runner_id": "runner_001"},
        headers={"X-Bot-Runner-Secret": "shh"},
    )

    assert res.status_code == 200

    claims = jwt.decode(
        res.json()["token"],
        "signing_key_123",
        algorithms=["HS256"],
        audience="ustock-runner",
        issuer="ustock-backend",
    )
    assert claims["sub"] == "runner_001"