# backend/api/core/config.py
from __future__ import annotations

import json
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


def _parse_cors_origins(raw) -> List[str]:
    """
    Accepts:
      - list[str] (already parsed)
      - JSON list string: '["http://localhost:5173", "..."]'
      - comma-separated string: 'http://localhost:5173,https://...'
      - blank/None -> []
    """
    if raw is None:
        return []

    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]

    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []

        # JSON list string
        if s.startswith("["):
            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    return [str(x).strip() for x in arr if str(x).strip()]
            except Exception:
                pass

        # comma-separated
        return [v.strip() for v in s.split(",") if v.strip()]

    s = str(raw).strip()
    return [s] if s else []


class CookieSettings(BaseModel):
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


class PasswordPolicy(BaseModel):
    """
    MUST match api.schemas.auth.validate_password() field names.

    Based on your traceback, validate_password references:
      - policy.min_len
      - policy.forbid_email_local_part
      - (likely also) policy.forbid_username  (already used earlier)
      - and possibly require_* flags (keep them, common pattern)
    """

    # length
    min_len: int = Field(default_factory=lambda: _env_int("USTOCK_PASSWORD_MIN_LEN", "12"))

    # composition requirements
    require_upper: bool = Field(default_factory=lambda: _env_bool("USTOCK_PASSWORD_REQUIRE_UPPER", "true"))
    require_lower: bool = Field(default_factory=lambda: _env_bool("USTOCK_PASSWORD_REQUIRE_LOWER", "true"))
    require_digit: bool = Field(default_factory=lambda: _env_bool("USTOCK_PASSWORD_REQUIRE_DIGIT", "true"))
    require_special: bool = Field(default_factory=lambda: _env_bool("USTOCK_PASSWORD_REQUIRE_SPECIAL", "true"))

    # content restrictions
    forbid_email_local_part: bool = Field(
        default_factory=lambda: _env_bool("USTOCK_PASSWORD_FORBID_EMAIL_LOCAL_PART", "true")
    )
    forbid_username: bool = Field(default_factory=lambda: _env_bool("USTOCK_PASSWORD_FORBID_USERNAME", "true"))


class Settings(BaseModel):
    env: str = Field(default_factory=lambda: (_getenv("ENV", "development") or "development"))
    database_url: str = Field(default_factory=lambda: _getenv("DATABASE_URL", ""))

    supabase_url: str = Field(default_factory=lambda: _getenv("SUPABASE_URL", ""))
    supabase_anon_key: str = Field(default_factory=lambda: _getenv("SUPABASE_ANON_KEY", ""))

    # Service-role client for server-side upserts
    supabase_service_key: str = Field(default_factory=lambda: _getenv("SUPABASE_SERVICE_ROLE_KEY", ""))

    cors_origins: List[str] = Field(
        default_factory=lambda: _parse_cors_origins(
            _getenv(
                "USTOCK_CORS_ORIGINS",
                '["http://localhost:5173","http://127.0.0.1:5173","https://u-stock.vercel.app"]',
            )
        )
    )

    cookies: CookieSettings = Field(default_factory=CookieSettings)

    # REQUIRED by validate_password()
    password_policy: PasswordPolicy = Field(default_factory=PasswordPolicy)

    @field_validator("env", mode="before")
    @classmethod
    def _normalize_env(cls, v: str):
        s = (v or "development").strip().lower()
        if s == "local":
            return "development"
        return s

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _normalize_cors_origins(cls, v):
        return _parse_cors_origins(v)

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
            if not self.supabase_service_key:
                missing.append("SUPABASE_SERVICE_ROLE_KEY")
            if missing:
                raise ValueError(f"Missing required production env var(s): {', '.join(missing)}")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
