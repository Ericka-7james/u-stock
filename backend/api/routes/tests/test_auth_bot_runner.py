# api/routes/tests/test_auth_bot_runner.py
import importlib
import sys

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


def test_create_bot_runner_token_success(mod, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})

    monkeypatch.setattr(mod, "load_bot_runner_config", lambda: {"ttl_seconds": 300})
    monkeypatch.setattr(mod, "mint_bot_runner_token", lambda user_id, cfg: {"token": f"TOKEN_FOR_{user_id}", "cfg": cfg})

    client = _make_client(mod)
    res = client.post("/auth/bot-runner-token")

    assert res.status_code == 200
    body = res.json()
    assert body["token"] == "TOKEN_FOR_user_123"
    assert body["cfg"]["ttl_seconds"] == 300


def test_create_bot_runner_token_raises_500_on_error(mod, monkeypatch):
    monkeypatch.setattr(mod, "require_user", lambda req, resp: {"id": "user_123"})
    monkeypatch.setattr(mod, "load_bot_runner_config", lambda: {"ttl_seconds": 300})

    def _boom(user_id, cfg):
        raise Exception("kaboom")

    monkeypatch.setattr(mod, "mint_bot_runner_token", _boom)

    client = _make_client(mod)
    res = client.post("/auth/bot-runner-token")

    assert res.status_code == 500
    body = res.json()

    # because we used http_error standardized shape
    assert body["detail"]["code"] == "BOT_RUNNER_TOKEN_MINT_FAILED"
    assert "Could not mint bot runner token" in body["detail"]["message"]
    assert "kaboom" in body["detail"]["detail"]["error"]
