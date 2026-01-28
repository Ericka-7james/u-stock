from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _env_bool(name: str, default: str = "false") -> bool:
    return _env(name, default).lower() in ("1", "true", "yes", "y", "on")


def _env_int(name: str, default: str) -> int:
    try:
        return int(_env(name, default))
    except Exception:
        return int(default)


def _split_csv(raw: str) -> list[str]:
    return [x.strip() for x in (raw or "").split(",") if x.strip()]


@dataclass(frozen=True)
class PasswordPolicy:
    min_len: int = 12
    require_upper: bool = True
    require_lower: bool = True
    require_digit: bool = True
    require_special: bool = True
    forbid_email_local_part: bool = True
    forbid_username: bool = True


@dataclass(frozen=True)
class CookieSettings:
    name: str
    refresh_name: str
    secure: bool
    samesite: str
    max_age: int
    domain: str | None


@dataclass(frozen=True)
class Settings:
    env: str
    strict: bool

    cors_origins: list[str]
    cookies: CookieSettings
    password_policy: PasswordPolicy


def is_strict_env(env: str) -> bool:
    return env in ("staging", "prod", "production")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    env = _env("ENV", "local").lower()
    strict = is_strict_env(env)

    # CORS
    cors_origins = _split_csv(
        _env("USTOCK_CORS_ORIGINS", "http://localhost:5173,https://u-stock.vercel.app")
    )

    # Cookies
    cookie_name = _env("USTOCK_COOKIE_NAME", "access_token")
    refresh_cookie_name = _env("USTOCK_REFRESH_COOKIE_NAME", "refresh_token")
    cookie_secure = _env_bool("USTOCK_COOKIE_SECURE", "false")
    cookie_samesite = _env("USTOCK_COOKIE_SAMESITE", "lax").lower()
    if cookie_samesite not in ("lax", "strict", "none"):
        cookie_samesite = "lax"
    cookie_max_age = _env_int("USTOCK_COOKIE_MAX_AGE", "604800")
    cookie_domain = _env("USTOCK_COOKIE_DOMAIN", "")
    cookie_domain = cookie_domain or None

    cookies = CookieSettings(
        name=cookie_name,
        refresh_name=refresh_cookie_name,
        secure=cookie_secure,
        samesite=cookie_samesite,
        max_age=cookie_max_age,
        domain=cookie_domain,
    )

    # Password policy (env-overridable, with sane defaults)
    policy = PasswordPolicy(
        min_len=_env_int("AUTH_PASSWORD_MIN_LEN", "12"),
        require_upper=_env_bool("AUTH_PASSWORD_REQUIRE_UPPER", "true"),
        require_lower=_env_bool("AUTH_PASSWORD_REQUIRE_LOWER", "true"),
        require_digit=_env_bool("AUTH_PASSWORD_REQUIRE_DIGIT", "true"),
        require_special=_env_bool("AUTH_PASSWORD_REQUIRE_SPECIAL", "true"),
        forbid_email_local_part=_env_bool("AUTH_PASSWORD_FORBID_EMAIL", "true"),
        forbid_username=_env_bool("AUTH_PASSWORD_FORBID_USERNAME", "true"),
    )

    return Settings(
        env=env,
        strict=strict,
        cors_origins=cors_origins,
        cookies=cookies,
        password_policy=policy,
    )
