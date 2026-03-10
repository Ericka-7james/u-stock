# backend/api/routes/bots/deps.py

"""Shared dependencies for bot routes.

This module centralizes reusable dependency and identity-resolution helpers
used by the modular bot route handlers.

It intentionally does not define a FastAPI router. Instead, it provides
small dependency functions that keep route modules focused on request and
response behavior.
"""

from __future__ import annotations

from typing import Any, Dict, Mapping

from fastapi import HTTPException, Request, Response

from api.core.bots.service import BotService
from api.deps import require_user


def get_bot_service() -> BotService:
    """Returns the bot service dependency."""
    return BotService()


def claims_user_id(claims: Mapping[str, Any]) -> str:
    """Extracts a user id from runner claims.

    Args:
        claims: Token claims mapping.

    Returns:
        str: User id if present, otherwise empty string.
    """
    c = dict(claims or {})
    return str(c.get("uid") or c.get("sub") or c.get("user_id") or "").strip()


def require_cookie_user_id(request: Request, response: Response) -> str:
    """Resolves the authenticated user id from cookie-based auth.

    Args:
        request: FastAPI request object.
        response: FastAPI response object.

    Returns:
        str: Authenticated user id.

    Raises:
        HTTPException: If the user is not authenticated.
    """
    user = require_user(request, response)
    uid = str((user or {}).get("id") or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="unauthorized")
    return uid


def require_uid_from_claims(claims: Mapping[str, Any]) -> str:
    """Resolves the authenticated user id from runner JWT claims.

    Args:
        claims: Runner token claims.

    Returns:
        str: Authenticated user id.

    Raises:
        HTTPException: If no usable user id is found in the claims.
    """
    uid = claims_user_id(claims)
    if not uid:
        raise HTTPException(status_code=401, detail="runner token missing uid")
    return uid


def runner_effective_user_id(*, claims: Mapping[str, Any], fallback_user_id: Any = None) -> str:
    """Determines the effective user id for runner-auth requests.

    Prefers signed runner claims. Allows fallback only when claims do not
    include a user id.

    Args:
        claims: Runner JWT claims.
        fallback_user_id: Optional fallback from payload.

    Returns:
        str: Effective user id.

    Raises:
        HTTPException: If no user id can be resolved.
    """
    uid = claims_user_id(claims)
    if uid:
        return uid

    fallback = str(fallback_user_id or "").strip()
    if fallback:
        return fallback

    raise HTTPException(status_code=401, detail="runner token missing uid")