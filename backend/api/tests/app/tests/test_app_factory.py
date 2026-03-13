import importlib

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def app_module(monkeypatch):
    """Loads the app factory module under test mode."""
    # Ensure test runner ENV wins over anything loaded from .env
    monkeypatch.setenv("ENV", "test")
    mod = importlib.import_module("api.app.app_factory")
    importlib.reload(mod)
    return mod


def _set_min_prod_env(monkeypatch):
    """Sets the minimum production env vars required for Settings()."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/test_db")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")


def test_create_app_root_and_health_reflect_effective_env(app_module):
    app = app_module.create_app()
    c = TestClient(app)

    r = c.get("/")
    assert r.status_code == 200
    data = r.json()

    assert data["name"] == "u-stock-auth-backend"
    assert data["status"] == "running"
    assert data["env"] == "test"

    # These are now part of the root payload
    assert "strict_settings" in data
    assert data["cors_origins"] is not None  # only hidden in production
    assert isinstance(data["cors_origins"], list)

    r2 = c.get("/health")
    assert r2.status_code == 200
    assert r2.json() == {"status": "ok", "env": "test"}


def test_unhandled_exception_handler_includes_error_when_not_production(app_module):
    app = app_module.create_app()

    @app.get("/__boom")
    def boom():
        raise RuntimeError("kaboom")

    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/__boom")

    assert r.status_code == 500
    body = r.json()
    assert body["detail"] == "Server error"
    # app_factory uses repr(exc), so it will look like RuntimeError('kaboom')
    assert "RuntimeError" in body.get("error", "")
    assert "kaboom" in body.get("error", "")


def test_root_hides_cors_origins_in_production(monkeypatch):
    _set_min_prod_env(monkeypatch)

    mod = importlib.import_module("api.app.app_factory")
    importlib.reload(mod)

    app = mod.create_app()
    c = TestClient(app)

    r = c.get("/")
    assert r.status_code == 200
    data = r.json()

    assert data["env"] == "production"
    assert data["cors_origins"] is None  # production hides it


def test_unhandled_exception_handler_hides_error_in_production(monkeypatch):
    _set_min_prod_env(monkeypatch)

    mod = importlib.import_module("api.app.app_factory")
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


def test_http_exception_handler_preserves_status_and_detail(app_module):
    app = app_module.create_app()

    @app.get("/__teapot")
    def teapot():
        # FastAPI HTTPException should stay as its status (not become 500)
        raise app_module.HTTPException(status_code=418, detail="short and stout")

    c = TestClient(app, raise_server_exceptions=False)
    r = c.get("/__teapot")

    assert r.status_code == 418
    assert r.json() == {"detail": "short and stout"}