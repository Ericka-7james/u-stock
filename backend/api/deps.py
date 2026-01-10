# api/deps.py
from __future__ import annotations

from typing import Any, Dict, Tuple, Optional
import os
from fastapi import HTTPException, Request, Response
from supabase import Client, create_client

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

COOKIE_NAME = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()
REFRESH_COOKIE_NAME = os.getenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token").strip()

ENV = os.getenv("ENV", "development").strip().lower()
COOKIE_SECURE = ENV == "production"
COOKIE_SAMESITE = "none" if ENV == "production" else "lax"
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))

# Runner auth
BOT_RUNNER_SECRET_ENV = os.getenv("BOT_RUNNER_SECRET", "").strip()
BOT_RUNNER_HEADER = "X-Bot-Runner-Secret"
RUNNER_USER_HEADER = "X-Runner-User-Id"


def get_supabase_anon() -> Client:
    if not SUPABASE_URL:
        raise HTTPException(status_code=500, detail="SUPABASE_URL is missing")
    if not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_ANON_KEY is missing")
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def set_auth_cookies(response: Response, access_token: str, refresh_token: str | None = None) -> None:
    if access_token:
        response.set_cookie(
            key=COOKIE_NAME,
            value=access_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=COOKIE_MAX_AGE,
            path="/",
        )
    if refresh_token:
        response.set_cookie(
            key=REFRESH_COOKIE_NAME,
            value=refresh_token,
            httponly=True,
            secure=COOKIE_SECURE,
            samesite=COOKIE_SAMESITE,
            max_age=COOKIE_MAX_AGE,
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
    sb = get_supabase_anon()
    access = request.cookies.get(COOKIE_NAME)
    refresh = request.cookies.get(REFRESH_COOKIE_NAME)

    if access:
        try:
            res = sb.auth.get_user(access)
            uid, email = _extract_user_id_and_email(res)
            if uid:
                return {"id": uid, "email": email or ""}
        except Exception:
            pass

    if refresh:
        try:
            try:
                refreshed = sb.auth.refresh_session(refresh)
            except Exception:
                refreshed = sb.auth.refresh_session({"refresh_token": refresh})

            uid, email = _extract_user_id_and_email(refreshed)

            session = getattr(refreshed, "session", None)
            if session:
                new_access = getattr(session, "access_token", None)
                new_refresh = getattr(session, "refresh_token", None)
                if new_access:
                    set_auth_cookies(response, new_access, new_refresh)

            if uid:
                return {"id": uid, "email": email or ""}
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid session: {repr(e)}")

    raise HTTPException(status_code=401, detail="Not authenticated")


def require_user_or_runner(request: Request, response: Response) -> Dict[str, str]:
    """
    - Normal browser calls: uses cookies (require_user)
    - Runner calls: uses X-Bot-Runner-Secret + X-Runner-User-Id
    """
    secret = (request.headers.get(BOT_RUNNER_HEADER) or "").strip()
    runner_uid = (request.headers.get(RUNNER_USER_HEADER) or "").strip()

    if BOT_RUNNER_SECRET_ENV and secret and secret == BOT_RUNNER_SECRET_ENV:
        if not runner_uid:
            raise HTTPException(status_code=400, detail="Runner missing X-Runner-User-Id header")
        # email unknown for runner requests; not needed
        return {"id": runner_uid, "email": ""}

    return require_user(request, response)
