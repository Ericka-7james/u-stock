# api/core/security.py
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Optional, Tuple

from cryptography.fernet import Fernet
from fastapi import HTTPException, Request, Response
from supabase import Client, create_client


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _cookie_config() -> Dict[str, Any]:
    env = _env("ENV", "development").lower()
    cookie_secure = env == "production"
    cookie_samesite = "none" if env == "production" else "lax"
    cookie_max_age = int(_env("USTOCK_COOKIE_MAX_AGE", "604800"))  # 7 days
    return {
        "ENV": env,
        "COOKIE_SECURE": cookie_secure,
        "COOKIE_SAMESITE": cookie_samesite,
        "COOKIE_MAX_AGE": cookie_max_age,
        "COOKIE_NAME": _env("USTOCK_COOKIE_NAME", "access_token"),
        "REFRESH_COOKIE_NAME": _env("USTOCK_REFRESH_COOKIE_NAME", "refresh_token"),
    }


def _service_key() -> str:
    # Support both names; prefer canonical service role key
    return _env("SUPABASE_SERVICE_ROLE_KEY") or _env("SUPABASE_SECRET_KEY")


def _raise_supabase_env_missing(which: str) -> None:
    raise HTTPException(
        status_code=500,
        detail={
            "code": "SUPABASE_MISCONFIGURED",
            "message": f"{which} is missing in environment variables.",
            "hint": "Check your backend env and restart the backend.",
        },
    )


def _wrap_supabase_exception(e: Exception, which: str) -> HTTPException:
    msg = str(e) or repr(e)
    lower = msg.lower()

    if "invalid api key" in lower:
        return HTTPException(
            status_code=500,
            detail={
                "code": "SUPABASE_INVALID_KEY",
                "message": f"Supabase rejected {which}.",
                "hint": (
                    f"Verify SUPABASE_URL matches the project for your {which}, "
                    "and paste the correct key into env. Then restart the backend."
                ),
                "provider": "supabase",
                "which": which,
            },
        )

    return HTTPException(
        status_code=500,
        detail={
            "code": "SUPABASE_ERROR",
            "message": f"Supabase client error ({which}).",
            "hint": "Check backend logs for more detail.",
            "provider": "supabase",
            "which": which,
            "raw": msg[:300],
        },
    )


@lru_cache(maxsize=2)
def get_supabase_anon() -> Client:
    url = _env("SUPABASE_URL")
    anon = _env("SUPABASE_ANON_KEY")

    if not url:
        _raise_supabase_env_missing("SUPABASE_URL")
    if not anon:
        _raise_supabase_env_missing("SUPABASE_ANON_KEY")

    try:
        return create_client(url, anon)
    except Exception as e:
        raise _wrap_supabase_exception(e, "SUPABASE_ANON_KEY")


@lru_cache(maxsize=2)
def get_supabase_service() -> Client:
    url = _env("SUPABASE_URL")
    service = _service_key()

    if not url:
        _raise_supabase_env_missing("SUPABASE_URL")
    if not service:
        _raise_supabase_env_missing("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)")

    try:
        return create_client(url, service)
    except Exception as e:
        which = "SUPABASE_SERVICE_ROLE_KEY" if _env("SUPABASE_SERVICE_ROLE_KEY") else "SUPABASE_SECRET_KEY"
        raise _wrap_supabase_exception(e, which)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str | None = None) -> None:
    cfg = _cookie_config()

    if access_token:
        response.set_cookie(
            key=cfg["COOKIE_NAME"],
            value=access_token,
            httponly=True,
            secure=cfg["COOKIE_SECURE"],
            samesite=cfg["COOKIE_SAMESITE"],
            max_age=cfg["COOKIE_MAX_AGE"],
            path="/",
        )

    if refresh_token:
        response.set_cookie(
            key=cfg["REFRESH_COOKIE_NAME"],
            value=refresh_token,
            httponly=True,
            secure=cfg["COOKIE_SECURE"],
            samesite=cfg["COOKIE_SAMESITE"],
            max_age=cfg["COOKIE_MAX_AGE"],
            path="/",
        )


def _extract_user_id_and_email(res: Any) -> Tuple[str | None, str | None]:
    user = getattr(res, "user", None) if res is not None else None
    if user is None and isinstance(res, dict):
        user = res.get("user")

    uid = getattr(user, "id", None) if user is not None else None
    email = getattr(user, "email", None) if user is not None else None

    if isinstance(user, dict):
        uid = uid or user.get("id")
        email = email or user.get("email")

    return uid, email


def require_user(request: Request, response: Response) -> Dict[str, str]:
    cfg = _cookie_config()
    sb = get_supabase_anon()

    access = request.cookies.get(cfg["COOKIE_NAME"])
    refresh = request.cookies.get(cfg["REFRESH_COOKIE_NAME"])

    # 1) Access token path
    if access:
        try:
            res = sb.auth.get_user(access)
            uid, email = _extract_user_id_and_email(res)
            if uid:
                return {"id": uid, "email": email or ""}
        except Exception:
            # fall through to refresh path
            pass

    # 2) Refresh token path
    if refresh:
        try:
            refreshed = None
            try:
                refreshed = sb.auth.refresh_session(refresh)
            except Exception as e1:
                try:
                    refreshed = sb.auth.refresh_session({"refresh_token": refresh})
                except Exception as e2:
                    raise HTTPException(
                        status_code=401,
                        detail={
                            "code": "INVALID_SESSION",
                            "message": "Invalid session: refresh failed",
                            "hint": "Sign in again.",
                            "debug": {"string": repr(e1), "dict": repr(e2)},
                        },
                    )

            uid, email = _extract_user_id_and_email(refreshed)

            session = None
            if isinstance(refreshed, dict):
                session = refreshed.get("session") or refreshed.get("data", {}).get("session")
            else:
                session = getattr(refreshed, "session", None) or getattr(getattr(refreshed, "data", None), "session", None)

            if session:
                if isinstance(session, dict):
                    new_access = session.get("access_token")
                    new_refresh = session.get("refresh_token")
                else:
                    new_access = getattr(session, "access_token", None)
                    new_refresh = getattr(session, "refresh_token", None)

                if new_access:
                    set_auth_cookies(response, new_access, new_refresh)

            if uid:
                return {"id": uid, "email": email or ""}

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "INVALID_SESSION",
                    "message": f"Invalid session: {repr(e)}",
                    "hint": "Sign in again.",
                },
            )

    raise HTTPException(
        status_code=401,
        detail={"code": "NOT_AUTHENTICATED", "message": "Not authenticated"},
    )


def _fernet() -> Fernet:
    key = _env("INTEGRATIONS_ENC_KEY")
    if not key:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "INTEGRATIONS_ENC_KEY_MISSING",
                "message": "INTEGRATIONS_ENC_KEY is missing",
                "hint": "Set INTEGRATIONS_ENC_KEY in backend env and restart.",
            },
        )
    # Fernet expects urlsafe-base64 32-byte key; this will raise ValueError if invalid
    return Fernet(key.encode("utf-8"))


def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    f = _fernet()
    return f.decrypt(token.encode("utf-8")).decode("utf-8")
