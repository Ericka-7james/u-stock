# api/core/tests/test_config.py

import importlib
import sys

import pytest


def _load_config():
    if "api.core.config" in sys.modules:
        return importlib.reload(sys.modules["api.core.config"])
    return importlib.import_module("api.core.config")


@pytest.fixture
def clean_env(monkeypatch):
    for key in [
        "ENV",
        "DATABASE_URL",
        "USTOCK_CORS_ORIGINS",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
    ]:
        monkeypatch.delenv(key, raising=False)
    yield


def _fresh_settings():
    config = _load_config()
    # clear cache so env changes apply
    config.get_settings.cache_clear()
    return config.get_settings()


def test_defaults_when_env_missing(clean_env):
    s = _fresh_settings()

    assert s.env == "development"
    assert s.database_url == ""
    assert s.supabase_url == ""
    assert s.supabase_anon_key == ""
    assert s.cors_origins == ["http://localhost:5173", "https://u-stock.vercel.app"]


def test_env_overrides(clean_env, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("SUPABASE_URL", "https://xyz.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon_key_123")
    monkeypatch.setenv("USTOCK_CORS_ORIGINS", "https://a.com,https://b.com")

    s = _fresh_settings()

    assert s.env == "development"
    assert s.database_url == "postgresql://user:pass@host:5432/db"
    assert s.supabase_url == "https://xyz.supabase.co"
    assert s.supabase_anon_key == "anon_key_123"
    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_cors_trims_whitespace_and_drops_empties(clean_env, monkeypatch):
    monkeypatch.setenv("USTOCK_CORS_ORIGINS", " https://a.com, ,https://b.com ,")
    s = _fresh_settings()
    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_production_requires_critical_env_vars(clean_env, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    # Intentionally missing DATABASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY

    with pytest.raises(ValueError) as e:
        _fresh_settings()

    msg = str(e.value)
    assert "Missing required production env var(s)" in msg
    assert "DATABASE_URL" in msg
    assert "SUPABASE_URL" in msg
    assert "SUPABASE_ANON_KEY" in msg


def test_production_allows_when_all_required_present(clean_env, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("SUPABASE_URL", "https://xyz.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon_key_123")

    s = _fresh_settings()
    assert s.env == "production"
