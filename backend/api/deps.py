from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, Response

from api.db import get_supabase_anon


RUNNER_SECRET_ENV = "BOT_RUNNER_SECRET"

# Header names
RUNNER_SECRET_HEADER = "X-Bot-Runner-Secret"
RUNNER_USER_ID_HEADER = "X-Runner-User-Id"
RUNNER_USER_ID_HEADER_ALT = "X-Bot-Runner-User-Id"


# -----------------------------
# Token extraction
# -----------------------------

def _get_bearer_token_from_cookie(request: Request) -> Optional[str]:
    """
    Supports Supabase + custom cookie names.
    """
    for name in ("access_token", "sb-access-token", "USTOCK_ACCESS_TOKEN"):
        v = request.cookies.get(name)
        if v:
            token = str(v).strip()
            if token:
                return token
    return None


def _get_bearer_token_from_auth_header(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1].strip()
        return token or None
    return None


# -----------------------------
# Supabase user normalization
# -----------------------------

def _extract_user_obj(ures: Any) -> Any:
    """
    Supabase client versions return different shapes.
    Normalize to a user object or dict.
    """
    if ures is None:
        return None

    user = getattr(ures, "user", None)
    if user is not None:
        return user

    if isinstance(ures, dict):
        return ures.get("user")

    return None


def _extract_user_fields(user: Any) -> tuple[Optional[str], Optional[str]]:
    """
    Extract user_id and email safely.
    """
    if user is None:
        return (None, None)

    if isinstance(user, dict):
        uid = user.get("id")
        email = user.get("email")
    else:
        uid = getattr(user, "id", None)
        email = getattr(user, "email", None)

    uid = str(uid).strip() if uid else None
    email = str(email).strip() if email else None

    return (uid or None, email or None)


# -----------------------------
# Auth dependencies
# -----------------------------

def require_user(request: Request, response: Response) -> Dict[str, Any]:
    """
    Cookie or Bearer-based user auth.
    Used by all UI endpoints.
    """
    token = (
        _get_bearer_token_from_auth_header(request)
        or _get_bearer_token_from_cookie(request)
    )

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sb = get_supabase_anon()

    try:
        ures = sb.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session token")

    user = _extract_user_obj(ures)
    user_id, email = _extract_user_fields(user)

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return {"id": user_id, "email": email}


def require_runner(request: Request, response: Response) -> Dict[str, Any]:
    """
    Runner-only authentication.
    Used by heartbeat + status_runner endpoints.
    """
    expected = (os.getenv(RUNNER_SECRET_ENV) or "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="BOT_RUNNER_SECRET not configured")

    got = (request.headers.get(RUNNER_SECRET_HEADER) or "").strip()
    if not got or got != expected:
        raise HTTPException(status_code=401, detail="Runner not authenticated")

    # Accept either header name for user_id
    user_id = (
        request.headers.get(RUNNER_USER_ID_HEADER)
        or request.headers.get(RUNNER_USER_ID_HEADER_ALT)
        or ""
    ).strip()

    if not user_id:
        raise HTTPException(status_code=401, detail="Runner missing user_id header")

    return {"id": user_id, "email": None, "auth": "runner"}


def require_user_or_runner(request: Request, response: Response) -> Dict[str, Any]:
    """
    Hybrid auth:
    - Runner secret present → runner
    - Else → user
    """
    if request.headers.get(RUNNER_SECRET_HEADER):
        return require_runner(request, response)
    return require_user(request, response)
