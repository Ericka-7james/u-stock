# backend/api/security/bot_runner_dep.py
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
import jwt


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name, "")
    if raw == "":
        return default
    return raw.lower() in ("1", "true", "t", "yes", "y", "on")


def _get_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return None


def _decode_runner_jwt(token: str) -> Dict[str, Any]:
    """
    Decode & validate runner JWT.

    Breakpoints:
    - RUNNER_JWT_SIGNING_KEY mismatch between backend and token-mint endpoint
    - iss/aud mismatch between backend and runner expectations
    - exp/iat missing or clock skew issues
    """
    key = _env("RUNNER_JWT_SIGNING_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="RUNNER_JWT_SIGNING_KEY not configured")

    issuer = _env("RUNNER_JWT_ISSUER", "ustock-backend")
    audience = _env("RUNNER_JWT_AUDIENCE", "ustock-runner")

    try:
        # NOTE: leeway helps with minor clock skew between runner host and backend host.
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256"],
            issuer=issuer,
            audience=audience,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )
        if not isinstance(claims, dict):
            raise HTTPException(status_code=401, detail="Invalid runner token")
        return claims

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Runner token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid runner token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid runner token")


def require_bot_runner(request: Request) -> str:
    """
    Dependency used by runner-auth endpoints.

    Returns:
      runner_id (claims['sub'])

    Security TODO (optional hardening):
    - include user_id in JWT claims as 'uid' when minting tokens
    - enforce payload user_id matches claims['uid']
    """
    token = _get_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Runner token missing")

    claims = _decode_runner_jwt(token)

    runner_id = str(claims.get("sub") or "").strip()
    if not runner_id:
        raise HTTPException(status_code=401, detail="Invalid runner token")

    return runner_id


def require_bot_runner_claims(request: Request) -> Dict[str, Any]:
    """
    Dependency when you need claims in endpoints.
    """
    token = _get_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Runner token missing")
    return _decode_runner_jwt(token)


def enforce_runner_user(*, payload_user_id: str, claims: Dict[str, Any]) -> None:
    """
    Optional enforcement gate. OFF by default.

    If RUNNER_ENFORCE_UID_CLAIM=true:
      - claims must include 'uid'
      - payload user_id must match claims['uid']

    This prevents a runner JWT from spoofing heartbeats/intents for another user.
    """
    if not _env_bool("RUNNER_ENFORCE_UID_CLAIM", False):
        return

    uid_claim = str(claims.get("uid") or "").strip()
    if not uid_claim:
        raise HTTPException(status_code=401, detail="Runner token missing uid claim")

    if str(payload_user_id or "").strip() != uid_claim:
        raise HTTPException(status_code=403, detail="Runner user_id mismatch")

"""
TODO (future):
- Add per-runner rate limits for /heartbeat and /submit-intents.
- Add structured logging for runner auth failures (server-side only).
"""
