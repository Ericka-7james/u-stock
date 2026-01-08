# api/deps.py
from __future__ import annotations

from typing import Any, Dict, Tuple
import os
from fastapi import HTTPException, Request, Response
from supabase import Client, create_client

# These env var names match what you already use in index.py
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()

COOKIE_NAME = os.getenv("USTOCK_COOKIE_NAME", "access_token").strip()
REFRESH_COOKIE_NAME = os.getenv("USTOCK_REFRESH_COOKIE_NAME", "refresh_token").strip()

ENV = os.getenv("ENV", "development").strip().lower()
COOKIE_SECURE = ENV == "production"
COOKIE_SAMESITE = "none" if ENV == "production" else "lax"
COOKIE_MAX_AGE = int(os.getenv("USTOCK_COOKIE_MAX_AGE", "604800"))  # 7 days


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
    """
    Returns {"id": ..., "email": ...} or raises 401.
    Also refreshes cookies if refresh_token exists & access expired.
    """
    sb = get_supabase_anon()
    access = request.cookies.get(COOKIE_NAME)
    refresh = request.cookies.get(REFRESH_COOKIE_NAME)

    # 1) Try access token
    if access:
        try:
            res = sb.auth.get_user(access)
            uid, email = _extract_user_id_and_email(res)
            if uid:
                return {"id": uid, "email": email or ""}
        except Exception:
            pass

    # 2) Refresh token -> mint new session
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
