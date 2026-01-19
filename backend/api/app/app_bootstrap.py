from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv


def bootstrap_paths() -> Path:
    """
    Ensure backend/ is on sys.path for 'api.*' imports in certain run modes.
    Returns backend dir.
    """
    this_file = Path(__file__).resolve()  # backend/api/app/app_bootstrap.py
    api_dir = this_file.parents[1]        # backend/api
    backend_dir = api_dir.parent          # backend

    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    return backend_dir


def load_env(backend_dir: Path) -> str:
    """
    Load .env then .env.local, with this rule:
      - OS / pytest env ALWAYS wins
      - .env.local overrides .env (but not OS env)

    Returns ENV lowercased.
    """
    # Snapshot environment as it exists before dotenv runs (pytest monkeypatch lives here)
    original_env = dict(os.environ)

    # Load base first (no override)
    load_dotenv(backend_dir / ".env", override=False)

    # Then allow .env.local to override .env values (override=True)
    load_dotenv(backend_dir / ".env.local", override=True)

    # Restore any variables that already existed in the OS environment
    for k, v in original_env.items():
        os.environ[k] = v

    return os.getenv("ENV", "local").strip().lower()


def is_strict_env(env: str) -> bool:
    return env in ("staging", "prod", "production")


def load_settings(env: str):
    """
    Keep Settings strict in prod/staging.
    In local/test, allow missing env without killing app import/tests.
    Returns (settings_or_none, strict_settings_bool)
    """
    strict = is_strict_env(env)
    try:
        from api.settings import Settings

        return Settings(strict=strict), strict
    except Exception:
        if strict:
            raise
        return None, False


def cors_origins() -> list[str]:
    raw = os.getenv(
        "USTOCK_CORS_ORIGINS",
        "http://localhost:5173,https://u-stock.vercel.app",
    )
    return [o.strip() for o in raw.split(",") if o.strip()]


def cookie_cfg():
    """
    Returns:
      (cookie_name, refresh_cookie_name, cookie_secure, cookie_samesite, cookie_max_age)
    """
    cookie_name = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()
    refresh_cookie_name = os.getenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token").strip()
    cookie_secure = os.getenv("USTOCK_COOKIE_SECURE", "false").strip().lower() in ("1", "true", "yes")
    cookie_samesite = os.getenv("USTOCK_COOKIE_SAMESITE", "lax").strip().lower()
    cookie_max_age = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))
    return cookie_name, refresh_cookie_name, cookie_secure, cookie_samesite, cookie_max_age
