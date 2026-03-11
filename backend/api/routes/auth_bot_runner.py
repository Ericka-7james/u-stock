# backend/api/routes/auth_bot_runner.py
"""Runner authentication routes.

This module exposes the endpoint used by trusted bot runners to mint short-
lived JWTs for subsequent runner-authenticated API calls.

The route is intended for server-to-server usage where the caller first proves
knowledge of a shared secret and then receives a signed JWT scoped for runner
operations.

Compatibility:
    The module preserves support for older header and environment variable
    names so existing local runners and older tooling do not break during the
    migration to the newer naming scheme.

Environment variables:
    RUNNER_SHARED_SECRET:
        Preferred shared secret used to authenticate the runner at token mint
        time.
    BOT_RUNNER_SECRET:
        Legacy fallback shared secret name.
    RUNNER_JWT_SIGNING_KEY:
        Symmetric signing key used to sign runner JWTs.
    RUNNER_JWT_ISSUER:
        Optional JWT issuer. Defaults to "ustock-backend".
    RUNNER_JWT_AUDIENCE:
        Optional JWT audience. Defaults to "ustock-runner".
    RUNNER_JWT_TTL_SECONDS:
        Optional token lifetime in seconds. Clamped to 60..3600.

Routes:
    POST /api/runner/token:
        Mints a short-lived JWT for an authenticated runner.
"""

from __future__ import annotations

import logging
import os
import re
import secrets
import time
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/runner", tags=["runner-auth"])

logger = logging.getLogger(__name__)

_RUNNER_ID_RE = re.compile(r"^[a-zA-Z0-9._:@-]{1,200}$")


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        str: Trimmed environment variable value or the provided default.
    """
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int) -> int:
    """Returns an integer environment variable with fallback.

    Args:
        name: Environment variable name.
        default: Default integer value if parsing fails.

    Returns:
        int: Parsed integer value or the provided default.
    """
    raw = _env(name, "")
    if raw == "":
        return int(default)

    try:
        return int(raw)
    except Exception:
        return int(default)


def _request_ip(request: Request) -> str:
    """Extracts a best-effort client IP string for logging.

    Args:
        request: Incoming FastAPI request.

    Returns:
        str: Client IP address if available, otherwise an empty string.
    """
    client = getattr(request, "client", None)
    host = getattr(client, "host", None)
    return str(host or "").strip()


def _get_runner_secret(request: Request) -> str:
    """Extracts the runner shared secret from request headers.

    Supported header names:
        - X-Runner-Secret
        - X-Bot-Runner-Secret

    Args:
        request: Incoming FastAPI request.

    Returns:
        str: Trimmed shared secret header value, or an empty string.
    """
    return (
        request.headers.get("X-Runner-Secret")
        or request.headers.get("X-Bot-Runner-Secret")
        or ""
    ).strip()


def _expected_shared_secret() -> str:
    """Returns the configured shared secret.

    Supported environment variable names:
        - RUNNER_SHARED_SECRET
        - BOT_RUNNER_SECRET

    Returns:
        str: Configured shared secret, or an empty string if not set.
    """
    return _env("RUNNER_SHARED_SECRET") or _env("BOT_RUNNER_SECRET")


def _require_runner_user_id(request: Request) -> str:
    """Extracts and validates the runner-bound user id header.

    Supported header names:
        - X-Runner-User-Id
        - X-Bot-Runner-User-Id

    Args:
        request: Incoming FastAPI request.

    Raises:
        HTTPException: If the user id header is missing.

    Returns:
        str: Trimmed user id header value.
    """
    uid = (
        request.headers.get("X-Runner-User-Id")
        or request.headers.get("X-Bot-Runner-User-Id")
        or ""
    ).strip()

    if not uid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Runner user id header missing",
        )

    return uid


def _require_shared_secret(request: Request) -> None:
    """Validates the caller's shared secret.

    Uses constant-time comparison to reduce timing leakage.

    Args:
        request: Incoming FastAPI request.

    Raises:
        HTTPException: If the shared secret is missing, invalid, or not
            configured on the server.
    """
    expected = _expected_shared_secret()
    if not expected:
        logger.error(
            "Runner shared secret is not configured",
            extra={"client_ip": _request_ip(request)},
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Runner shared secret not configured",
        )

    got = _get_runner_secret(request)
    if not got or not secrets.compare_digest(got, expected):
        logger.warning(
            "Runner authentication failed due to invalid shared secret",
            extra={"client_ip": _request_ip(request)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Runner not authenticated",
        )


def _require_signing_key() -> str:
    """Returns the configured JWT signing key.

    Raises:
        HTTPException: If the signing key is not configured.

    Returns:
        str: JWT signing key.
    """
    signing_key = _env("RUNNER_JWT_SIGNING_KEY")
    if not signing_key:
        logger.error("RUNNER_JWT_SIGNING_KEY is not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="RUNNER_JWT_SIGNING_KEY not configured",
        )
    return signing_key


def _require_valid_runner_id(raw_runner_id: str) -> str:
    """Validates and normalizes the incoming runner id.

    Args:
        raw_runner_id: Raw runner id from the request payload.

    Raises:
        HTTPException: If the runner id is missing or invalid.

    Returns:
        str: Cleaned runner id.
    """
    runner_id = str(raw_runner_id or "").strip()
    if not runner_id or not _RUNNER_ID_RE.fullmatch(runner_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid runner_id",
        )
    return runner_id


def _runner_token_ttl_seconds() -> int:
    """Returns the clamped runner token TTL.

    The TTL is clamped to a production-safe range of 60 to 3600 seconds.

    Returns:
        int: JWT TTL in seconds.
    """
    ttl = _env_int("RUNNER_JWT_TTL_SECONDS", 600)
    return max(60, min(ttl, 3600))


class RunnerTokenIn(BaseModel):
    """Request payload for minting a runner JWT."""

    runner_id: str = Field(..., min_length=1, max_length=200)


class RunnerTokenOut(BaseModel):
    """Response payload containing a minted runner JWT."""

    token: str
    expires_in: int


@router.post("/token", response_model=RunnerTokenOut)
def mint_runner_token(payload: RunnerTokenIn, request: Request) -> RunnerTokenOut:
    """Mints a short-lived runner JWT.

    The caller must authenticate with the configured shared secret header and
    must provide a runner-bound user id header. On success, the server returns
    a signed JWT containing standard claims plus a required `uid` claim used
    by downstream runner-authenticated endpoints.

    Args:
        payload: Runner token mint request payload.
        request: Incoming FastAPI request.

    Raises:
        HTTPException: If the caller is not authenticated, the runner id is
            invalid, the runner user id header is missing, or required server
            configuration is missing.

    Returns:
        RunnerTokenOut: Signed JWT and expiration interval in seconds.
    """
    _require_shared_secret(request)
    signing_key = _require_signing_key()
    runner_id = _require_valid_runner_id(payload.runner_id)
    uid = _require_runner_user_id(request)

    issuer = _env("RUNNER_JWT_ISSUER", "ustock-backend")
    audience = _env("RUNNER_JWT_AUDIENCE", "ustock-runner")
    ttl = _runner_token_ttl_seconds()
    now = int(time.time())

    claims = {
        "sub": runner_id,
        "uid": uid,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + ttl,
        "scope": "runner",
    }

    token = jwt.encode(claims, signing_key, algorithm="HS256")

    logger.info(
        "Minted runner token",
        extra={
            "event": "runner_token_minted",
            "runner_id": runner_id,
            "user_id": uid,
            "client_ip": _request_ip(request),
            "issued_at": now,
            "expires_in": ttl,
        },
    )

    return RunnerTokenOut(token=str(token), expires_in=int(ttl))


"""
Future improvements:
1. Add signing key rotation support across mint and verify paths.
2. Add shared secret rotation support for multi-runner deployments.
3. Emit structured audit logs to the central logging pipeline.
4. Add tests for missing X-Runner-User-Id and invalid shared-secret flows.
"""