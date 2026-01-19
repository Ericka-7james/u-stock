import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def app_module(monkeypatch):
    monkeypatch.setenv("ENV", "test")
    mod = importlib.import_module("api.app.app_factory")
    importlib.reload(mod)
    return mod


def test_create_app_has_root_and_health(app_module):
    app = app_module.create_app()
    c = TestClient(app)

    r = c.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "u-stock-auth-backend"
    assert data["status"] == "running"
    assert data["env"] == "test"

    r2 = c.get("/health")
    assert r2.status_code == 200
    assert r2.json()["status"] == "ok"
    assert r2.json()["env"] == "test"


def test_unhandled_exception_handler_includes_error_in_test_env(app_module):
    app = app_module.create_app()

    @app.get("/__boom")
    def boom():
        raise RuntimeError("kaboom")

    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/__boom")

    assert r.status_code == 500
    body = r.json()
    assert body["detail"] == "Server error"
    assert "kaboom" in body.get("error", "")


def test_unhandled_exception_handler_hides_error_in_prod(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    import api.app.app_factory as mod
    importlib.reload(mod)

    app = mod.create_app()

    @app.get("/__boom")
    def boom():
        raise RuntimeError("kaboom")

    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/__boom")

    assert r.status_code == 500
    body = r.json()
    assert body["detail"] == "Server error"
    assert "error" not in body
