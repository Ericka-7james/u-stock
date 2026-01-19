# api/core/tests/test_db.py
import importlib
import sys

import pytest
from sqlalchemy import text


def _reload_modules():
    """
    Reload config + db so env changes apply and module singletons reset.
    """
    if "api.core.config" in sys.modules:
        importlib.reload(sys.modules["api.core.config"])
    else:
        importlib.import_module("api.core.config")

    if "api.core.db" in sys.modules:
        return importlib.reload(sys.modules["api.core.db"])
    return importlib.import_module("api.core.db")


@pytest.fixture
def clean_env(monkeypatch):
    for key in ["ENV", "DATABASE_URL", "USTOCK_CORS_ORIGINS", "SUPABASE_URL", "SUPABASE_ANON_KEY"]:
        monkeypatch.delenv(key, raising=False)
    yield


@pytest.fixture
def db_cleanup():
    """
    Ensure engines / pooled connections are disposed between tests,
    preventing ResourceWarning: unclosed database connections (SQLite).
    """
    yield
    if "api.core.db" in sys.modules:
        sys.modules["api.core.db"].shutdown_db()


def test_init_db_creates_engine_and_sessionmaker(clean_env, monkeypatch, db_cleanup):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite:///:memory:")

    dbmod = _reload_modules()

    dbmod.init_db()
    engine = dbmod.get_engine()
    SessionLocal = dbmod.get_sessionmaker()

    assert engine is not None
    assert SessionLocal is not None

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


def test_get_db_yields_session(clean_env, monkeypatch, db_cleanup):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.setenv("DATABASE_URL", "sqlite+pysqlite:///:memory:")

    dbmod = _reload_modules()

    gen = dbmod.get_db()
    session = next(gen)
    try:
        assert session is not None
        result = session.execute(text("SELECT 1")).scalar()
        assert result == 1
    finally:
        gen.close()


def test_get_db_raises_when_database_url_missing(clean_env, monkeypatch, db_cleanup):
    monkeypatch.setenv("ENV", "development")
    # DATABASE_URL intentionally missing

    dbmod = _reload_modules()

    with pytest.raises(RuntimeError, match="Database is not configured"):
        gen = dbmod.get_db()
        next(gen)
