# backend/api/core/tests/test_config.py

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
        "SUPABASE_SERVICE_ROLE_KEY",
        # cookie-related (keep tests isolated)
        "USTOCK_COOKIE_NAME",
        "USTOCK_REFRESH_COOKIE_NAME",
        "USTOCK_COOKIE_SECURE",
        "USTOCK_COOKIE_SAMESITE",
        "USTOCK_COOKIE_MAX_AGE",
        "USTOCK_COOKIE_DOMAIN",
        # password policy
        "USTOCK_PASSWORD_MIN_LEN",
        "USTOCK_PASSWORD_REQUIRE_UPPER",
        "USTOCK_PASSWORD_REQUIRE_LOWER",
        "USTOCK_PASSWORD_REQUIRE_DIGIT",
        "USTOCK_PASSWORD_REQUIRE_SPECIAL",
        "USTOCK_PASSWORD_FORBID_EMAIL_LOCAL_PART",
        "USTOCK_PASSWORD_FORBID_USERNAME",
    ]:
        monkeypatch.delenv(key, raising=False)
    yield


def _fresh_settings():
    config = _load_config()
    config.get_settings.cache_clear()
    return config.get_settings()


def test_defaults_when_env_missing(clean_env):
    s = _fresh_settings()

    assert s.env == "development"
    assert s.database_url == ""
    assert s.supabase_url == ""
    assert s.supabase_anon_key == ""
    assert s.supabase_service_key == ""

    assert s.cors_origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://u-stock.vercel.app",
    ]

    assert s.cookies.name == "access_token"
    assert s.cookies.refresh_name == "refresh_token"
    assert s.cookies.secure is False
    assert s.cookies.samesite == "lax"
    assert s.cookies.max_age == 604800
    assert s.cookies.domain is None

    assert s.password_policy.min_len == 12
    assert s.password_policy.require_upper is True
    assert s.password_policy.require_lower is True
    assert s.password_policy.require_digit is True
    assert s.password_policy.require_special is True
    assert s.password_policy.forbid_email_local_part is True
    assert s.password_policy.forbid_username is True


def test_env_overrides(clean_env, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("SUPABASE_URL", "https://xyz.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon_key_123")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service_role_456")
    monkeypatch.setenv("USTOCK_CORS_ORIGINS", "https://a.com,https://b.com")

    s = _fresh_settings()

    assert s.env == "development"
    assert s.database_url == "postgresql://user:pass@host:5432/db"
    assert s.supabase_url == "https://xyz.supabase.co"
    assert s.supabase_anon_key == "anon_key_123"
    assert s.supabase_service_key == "service_role_456"
    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_env_normalizes_local_to_development_when_explicit(clean_env):
    # NOTE: Pydantic v2 does not validate default_factory outputs by default.
    # So to test the validator, pass the field explicitly.
    config = _load_config()
    s = config.Settings(env="local")
    assert s.env == "development"


def test_cors_trims_whitespace_and_drops_empties(clean_env, monkeypatch):
    monkeypatch.setenv("USTOCK_CORS_ORIGINS", " https://a.com, ,https://b.com ,")
    s = _fresh_settings()
    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_cors_accepts_json_list_string(clean_env, monkeypatch):
    monkeypatch.setenv("USTOCK_CORS_ORIGINS", '["https://a.com", " https://b.com ", ""]')
    s = _fresh_settings()
    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_cors_accepts_list_input_via_validator(clean_env):
    config = _load_config()
    s = config.Settings(cors_origins=[" https://a.com ", "", "https://b.com"])
    assert s.cors_origins == ["https://a.com", "https://b.com"]


def test_cookie_samesite_normalizes_invalid_to_lax_when_explicit(clean_env):
    # Same Pydantic-v2 note: validator won’t run on default_factory unless validate_default=True.
    config = _load_config()
    c = config.CookieSettings(samesite="BANANAS")
    assert c.samesite == "lax"


def test_cookie_domain_blank_becomes_none(clean_env, monkeypatch):
    monkeypatch.setenv("USTOCK_COOKIE_DOMAIN", "")
    s = _fresh_settings()
    assert s.cookies.domain is None


def test_cookie_overrides(clean_env, monkeypatch):
    monkeypatch.setenv("USTOCK_COOKIE_NAME", "a")
    monkeypatch.setenv("USTOCK_REFRESH_COOKIE_NAME", "b")
    monkeypatch.setenv("USTOCK_COOKIE_SECURE", "true")
    monkeypatch.setenv("USTOCK_COOKIE_SAMESITE", "None")
    monkeypatch.setenv("USTOCK_COOKIE_MAX_AGE", "123")
    monkeypatch.setenv("USTOCK_COOKIE_DOMAIN", "example.com")

    s = _fresh_settings()

    assert s.cookies.name == "a"
    assert s.cookies.refresh_name == "b"
    assert s.cookies.secure is True
    assert s.cookies.samesite == "none"
    assert s.cookies.max_age == 123
    assert s.cookies.domain == "example.com"


def test_password_policy_overrides(clean_env, monkeypatch):
    monkeypatch.setenv("USTOCK_PASSWORD_MIN_LEN", "16")
    monkeypatch.setenv("USTOCK_PASSWORD_REQUIRE_UPPER", "false")
    monkeypatch.setenv("USTOCK_PASSWORD_REQUIRE_LOWER", "true")
    monkeypatch.setenv("USTOCK_PASSWORD_REQUIRE_DIGIT", "0")
    monkeypatch.setenv("USTOCK_PASSWORD_REQUIRE_SPECIAL", "no")
    monkeypatch.setenv("USTOCK_PASSWORD_FORBID_EMAIL_LOCAL_PART", "false")
    monkeypatch.setenv("USTOCK_PASSWORD_FORBID_USERNAME", "false")

    s = _fresh_settings()

    assert s.password_policy.min_len == 16
    assert s.password_policy.require_upper is False
    assert s.password_policy.require_lower is True
    assert s.password_policy.require_digit is False
    assert s.password_policy.require_special is False
    assert s.password_policy.forbid_email_local_part is False
    assert s.password_policy.forbid_username is False


def test_production_requires_critical_env_vars(clean_env, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    # Intentionally missing DATABASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
    with pytest.raises(ValueError) as e:
        _fresh_settings()

    msg = str(e.value)
    assert "Missing required production env var(s)" in msg
    assert "DATABASE_URL" in msg
    assert "SUPABASE_URL" in msg
    assert "SUPABASE_ANON_KEY" in msg
    assert "SUPABASE_SERVICE_ROLE_KEY" in msg


def test_production_allows_when_all_required_present(clean_env, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@host:5432/db")
    monkeypatch.setenv("SUPABASE_URL", "https://xyz.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "anon_key_123")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service_role_456")

    s = _fresh_settings()
    assert s.env == "production"