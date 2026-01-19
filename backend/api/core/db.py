# api/core/db.py
from __future__ import annotations

from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from api.core.config import get_settings


def _make_engine(database_url: str) -> Optional[Engine]:
    """
    Create a SQLAlchemy Engine.

    Production/scaling notes:
    - pool_pre_ping avoids stale connections
    - pool_recycle prevents connections dying behind proxies/load balancers
    """
    if not database_url:
        return None

    connect_args = {}
    # SQLite needs this for multithreaded environments (FastAPI/Uvicorn)
    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    return create_engine(
        database_url,
        pool_pre_ping=True,
        pool_recycle=300,
        connect_args=connect_args,
    )


# Lazily initialized singletons (safe to import)
_ENGINE: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None


def init_db() -> None:
    """
    Initialize engine + sessionmaker once.

    Call this on application startup (or tests).
    Safe to call multiple times; it will only initialize once.
    """
    global _ENGINE, _SessionLocal

    if _ENGINE is not None and _SessionLocal is not None:
        return

    settings = get_settings()
    engine = _make_engine(settings.database_url)

    if engine is None:
        # In production, Settings validation should already prevent this.
        # In dev/test, allow app import; DB usage will fail fast in get_db().
        _ENGINE = None
        _SessionLocal = None
        return

    _ENGINE = engine
    _SessionLocal = sessionmaker(bind=_ENGINE, autoflush=False, autocommit=False)


def shutdown_db() -> None:
    """
    Dispose the engine / close pooled connections (useful for tests and graceful shutdown).
    """
    global _ENGINE, _SessionLocal
    if _ENGINE is not None:
        _ENGINE.dispose()
    _ENGINE = None
    _SessionLocal = None


def get_engine() -> Optional[Engine]:
    """
    Accessor for the engine. Initializes lazily.
    """
    if _ENGINE is None and _SessionLocal is None:
        init_db()
    return _ENGINE


def get_sessionmaker() -> Optional[sessionmaker]:
    """
    Accessor for SessionLocal. Initializes lazily.
    """
    if _ENGINE is None and _SessionLocal is None:
        init_db()
    return _SessionLocal


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a DB session.

    Production-safe behavior:
    - If DB is not configured, raise immediately (fail fast).
    """
    SessionLocal = get_sessionmaker()
    if SessionLocal is None:
        raise RuntimeError("Database is not configured (DATABASE_URL is missing).")

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def db_session() -> Generator[Session, None, None]:
    """
    Convenience context manager for scripts / jobs.
    """
    SessionLocal = get_sessionmaker()
    if SessionLocal is None:
        raise RuntimeError("Database is not configured (DATABASE_URL is missing).")

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
