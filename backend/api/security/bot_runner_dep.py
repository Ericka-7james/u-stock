# backend/api/security/bot_runner_dep.py
"""Runner JWT authentication dependencies.

This module contains FastAPI dependency helpers used to authenticate trusted
bot runners via short-lived JWTs.

Responsibilities:
    - Extract bearer tokens from incoming requests.
    - Decode and validate runner JWTs.
    - Expose the authenticated runner id and claims to route handlers.
    - Optionally enforce that a payload user id matches the JWT uid claim.

Environment variables:
    RUNNER_JWT_SIGNING_KEY:
        Symmetric signing key used to verify runner JWTs.
    RUNNER_JWT_ISSUER:
        Expected JWT issuer. Defaults to "ustock-backend".
    RUNNER_JWT_AUDIENCE:
        Expected JWT audience. Defaults to "ustock-runner".
    RUNNER_ENFORCE_UID_CLAIM:
        If true, require payload user_id to match claims["uid"].
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import jwt
from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


def _env(name: str, default: str = "") -> str:
    """Returns a stripped environment variable value.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        str: Trimmed environment variable value or the provided default.
    """
    return str(os.getenv(name, default) or "").strip()


def _env_bool(name: str, default: bool = False) -> bool:
    """Returns a boolean environment variable value.

    Truthy values include: 1, true, t, yes, y, on.

    Args:
        name: Environment variable name.
        default: Default value if the variable is missing.

    Returns:
        bool: Parsed boolean value.
    """
    raw = _env(name, "")
    if raw == "":
        return bool(default)
    return raw.lower() in ("1", "true", "t", "yes", "y", "on")


def _request_ip(request: Request) -> str:
    """Extracts a best-effort client IP string for logging.

    Args:
        request: FastAPI request object.

    Returns:
        str: Client IP address if available, otherwise an empty string.
    """
    client = getattr(request, "client", None)
    host = getattr(client, "host", None)
    return str(host or "").strip()


def _get_bearer(request: Request) -> Optional[str]:
    """Extracts a bearer token from the Authorization header.

    Args:
        request: FastAPI request object.

    Returns:
        Optional[str]: Bearer token if present and well formed, otherwise None.
    """
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None

    parts = auth.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1].strip()
        return token or None

    return None


def _require_signing_key() -> str:
    """Returns the configured runner JWT signing key.

    Raises:
        HTTPException: If the signing key is not configured.

    Returns:
        str: JWT signing key.
    """
    key = _env("RUNNER_JWT_SIGNING_KEY")
    if not key:
        logger.error("Runner JWT signing key is not configured")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="RUNNER_JWT_SIGNING_KEY not configured",
        )
    return key


def _jwt_issuer() -> str:
    """Returns the expected JWT issuer.

    Returns:
        str: Configured issuer or the default issuer.
    """
    return _env("RUNNER_JWT_ISSUER", "ustock-backend")


def _jwt_audience() -> str:
    """Returns the expected JWT audience.

    Returns:
        str: Configured audience or the default audience.
    """
    return _env("RUNNER_JWT_AUDIENCE", "ustock-runner")


def _decode_runner_jwt(token: str, *, request: Optional[Request] = None) -> Dict[str, Any]:
    """Decodes and validates a runner JWT.

    Validation includes:
        - signature verification
        - issuer validation
        - audience validation
        - expiration validation
        - issued-at presence
        - subject presence

    A small leeway is allowed for minor clock skew between runner and backend
    hosts.

    Args:
        token: Bearer token string to validate.
        request: Optional request object used for logging context.

    Raises:
        HTTPException: If the token is missing required configuration, expired,
            or otherwise invalid.

    Returns:
        Dict[str, Any]: Decoded JWT claims.
    """
    key = _require_signing_key()
    issuer = _jwt_issuer()
    audience = _jwt_audience()
    client_ip = _request_ip(request) if request is not None else ""

    try:
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
            logger.warning(
                "Runner token decode produced non-dict claims",
                extra={"client_ip": client_ip},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid runner token",
            )

        return claims

    except jwt.ExpiredSignatureError:
        logger.warning(
            "Runner token expired",
            extra={"client_ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Runner token expired",
        ) from None

    except jwt.InvalidTokenError:
        logger.warning(
            "Runner token invalid",
            extra={"client_ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid runner token",
        ) from None

    except HTTPException:
        raise

    except Exception:
        logger.exception(
            "Unexpected runner token validation failure",
            extra={"client_ip": client_ip},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid runner token",
        ) from None


def require_bot_runner(request: Request) -> str:
    """Resolves the authenticated runner id from a bearer token.

    This dependency is used by runner-authenticated endpoints that only need
    the runner id.

    Args:
        request: FastAPI request object.

    Raises:
        HTTPException: If the bearer token is missing or invalid.

    Returns:
        str: Authenticated runner id from the JWT `sub` claim.
    """
    token = _get_bearer(request)
    if not token:
        logger.warning(
            "Runner token missing",
            extra={"client_ip": _request_ip(request)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Runner token missing",
        )

    claims = _decode_runner_jwt(token, request=request)

    runner_id = str(claims.get("sub") or "").strip()
    if not runner_id:
        logger.warning(
            "Runner token missing sub claim",
            extra={"client_ip": _request_ip(request)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid runner token",
        )

    return runner_id


def require_bot_runner_claims(request: Request) -> Dict[str, Any]:
    """Resolves the decoded runner JWT claims from a bearer token.

    This dependency is used by runner-authenticated endpoints that need access
    to the full claim set, such as the optional `uid` binding.

    Args:
        request: FastAPI request object.

    Raises:
        HTTPException: If the bearer token is missing or invalid.

    Returns:
        Dict[str, Any]: Decoded JWT claims.
    """
    token = _get_bearer(request)
    if not token:
        logger.warning(
            "Runner token missing when claims requested",
            extra={"client_ip": _request_ip(request)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Runner token missing",
        )

    return _decode_runner_jwt(token, request=request)


def enforce_runner_user(*, payload_user_id: str, claims: Dict[str, Any]) -> None:
    """Optionally enforces payload user binding against the JWT uid claim.

    If `RUNNER_ENFORCE_UID_CLAIM=true`, then:
        - the token must include a non-empty `uid` claim
        - the provided payload user id must match the `uid` claim

    This prevents a valid runner token from being reused to submit heartbeat
    or intent data on behalf of another user.

    Args:
        payload_user_id: User id supplied by the request payload.
        claims: Decoded runner JWT claims.

    Raises:
        HTTPException: If enforcement is enabled and the uid claim is missing
            or does not match the payload user id.
    """
    if not _env_bool("RUNNER_ENFORCE_UID_CLAIM", False):
        return

    uid_claim = str(claims.get("uid") or "").strip()
    if not uid_claim:
        logger.warning("Runner token missing uid claim while enforcement is enabled")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Runner token missing uid claim",
        )

    payload_uid = str(payload_user_id or "").strip()
    if payload_uid != uid_claim:
        logger.warning(
            "Runner user_id mismatch",
            extra={"claim_uid": uid_claim, "payload_uid": payload_uid},
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Runner user_id mismatch",
        )


"""
Future improvements:
1. Support JWT signing key rotation for multi-environment runner deployments.
2. Add per-runner rate limiting for heartbeat and intent submission endpoints.
3. Emit structured audit logs to the central logging pipeline.
"""