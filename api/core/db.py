from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from api.core.config import settings

def _make_engine():
    if not settings.database_url:
        return None

    return create_engine(
        settings.database_url,
        pool_pre_ping=True,
        pool_recycle=300,
    )

engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False) if engine else None

def get_db():
    if not SessionLocal:
        yield None
        return

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
