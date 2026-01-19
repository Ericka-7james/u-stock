# backend/api/deps.py
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, Response

from api.db import get_supabase_anon


RUNNER_SECRET_ENV = "BOT_RUNNER_SECRET"

# Header names (accept both, but we will SEND the first one)
RUNNER_SECRET_HEADER = "X-Bot-Runner-Secret"
RUNNER_USER_ID_HEADER = "X-Runner-User-Id"
RUNNER_USER_ID_HEADER_ALT = "X-Bot-Runner-User-Id"  # tolerate older name


def _get_bearer_token_from_cookie(request: Request) -> Optional[str]:
    for name in ("access_token", "sb-access-token", "USTOCK_ACCESS_TOKEN"):
        v = request.cookies.get(name)
        if v:
            return str(v).strip() or None
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


def _extract_user_obj(ures: Any) -> Any:
    """
    Supabase python clients have returned different shapes across versions.
    Normalize into a "user" object/dict when possible.
    """
    if ures is None:
        return None

    # common: ures.user
    user = getattr(ures, "user", None)
    if user is not None:
        return user

    # sometimes dict: {"user": {...}}
    if isinstance(ures, dict):
        return ures.get("user")

    return None


def _extract_user_fields(user: Any) -> tuple[Optional[str], Optional[str]]:
    if user is None:
        return (None, None)

    user_id = getattr(user, "id", None) if not isinstance(user, dict) else user.get("id")
    email = getattr(user, "email", None) if not isinstance(user, dict) else user.get("email")

    uid = str(user_id).strip() if user_id is not None else None
    em = str(email).strip() if email is not None else None

    return (uid or None, em or None)


def require_user(request: Request, response: Response) -> Dict[str, Any]:
    token = _get_bearer_token_from_auth_header(request) or _get_bearer_token_from_cookie(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    sb = get_supabase_anon()

    try:
        ures = sb.auth.get_user(token)
    except Exception:
        # Don’t leak internal details to clients
        raise HTTPException(status_code=401, detail="Invalid session token")

    user = _extract_user_obj(ures)
    user_id, email = _extract_user_fields(user)

    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return {"id": user_id, "email": email}


def require_runner(request: Request, response: Response) -> Dict[str, Any]:
    expected = (os.getenv(RUNNER_SECRET_ENV) or "").strip()
    if not expected:
        raise HTTPException(status_code=500, detail="BOT_RUNNER_SECRET not configured on server")

    got = (request.headers.get(RUNNER_SECRET_HEADER) or "").strip()
    if not got or got != expected:
        raise HTTPException(status_code=401, detail="Runner not authenticated")

    # Accept either header name for user id
    user_id = (
        (request.headers.get(RUNNER_USER_ID_HEADER) or "")
        or (request.headers.get(RUNNER_USER_ID_HEADER_ALT) or "")
    ).strip()

    if not user_id:
        raise HTTPException(status_code=401, detail="Runner missing X-Runner-User-Id")

    return {"id": user_id, "email": None, "auth": "runner"}


def require_user_or_runner(request: Request, response: Response) -> Dict[str, Any]:
    # If runner secret header exists, treat it as runner auth
    if request.headers.get(RUNNER_SECRET_HEADER):
        return require_runner(request, response)
    return require_user(request, response)
