from __future__ import annotations

import os
from functools import lru_cache
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def _getenv(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _env_bool(name: str, default: str = "false") -> bool:
    return _getenv(name, default).lower() in ("1", "true", "yes", "y", "on")


def _env_int(name: str, default: str) -> int:
    try:
        return int(_getenv(name, default))
    except Exception:
        return int(default)


class CookieSettings(BaseModel):
    # minimal fields expected by api.core.http.cookies
    name: str = Field(default_factory=lambda: _getenv("USTOCK_COOKIE_NAME", "access_token"))
    refresh_name: str = Field(default_factory=lambda: _getenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token"))
    secure: bool = Field(default_factory=lambda: _env_bool("USTOCK_COOKIE_SECURE", "false"))
    samesite: str = Field(default_factory=lambda: _getenv("USTOCK_COOKIE_SAMESITE", "lax").lower())
    max_age: int = Field(default_factory=lambda: _env_int("USTOCK_COOKIE_MAX_AGE", "604800"))  # 7 days
    domain: Optional[str] = Field(default_factory=lambda: (_getenv("USTOCK_COOKIE_DOMAIN", "") or None))

    @field_validator("samesite", mode="before")
    @classmethod
    def _normalize_samesite(cls, v: str):
        s = (v or "lax").strip().lower()
        if s not in ("lax", "strict", "none"):
            return "lax"
        return s


class Settings(BaseModel):
    env: str = Field(default_factory=lambda: (_getenv("ENV", "development") or "development"))
    database_url: str = Field(default_factory=lambda: _getenv("DATABASE_URL", ""))

    supabase_url: str = Field(default_factory=lambda: _getenv("SUPABASE_URL", ""))
    supabase_anon_key: str = Field(default_factory=lambda: _getenv("SUPABASE_ANON_KEY", ""))

    cors_origins: List[str] = Field(
        default_factory=lambda: [
            v.strip()
            for v in _getenv(
                "USTOCK_CORS_ORIGINS",
                "http://localhost:5173,https://u-stock.vercel.app",
            ).split(",")
            if v.strip()
        ]
    )

    cookies: CookieSettings = Field(default_factory=CookieSettings)

    @field_validator("env", mode="before")
    @classmethod
    def _normalize_env(cls, v: str):
        s = (v or "development").strip().lower()
        if s == "local":
            return "development"
        return s

    @model_validator(mode="after")
    def _require_prod(self):
        if self.env == "production":
            missing: List[str] = []
            if not self.database_url:
                missing.append("DATABASE_URL")
            if not self.supabase_url:
                missing.append("SUPABASE_URL")
            if not self.supabase_anon_key:
                missing.append("SUPABASE_ANON_KEY")
            if missing:
                raise ValueError(f"Missing required production env var(s): {', '.join(missing)}")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
