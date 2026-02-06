from __future__ import annotations

import os
from typing import Optional

from fastapi import HTTPException, Request
import jwt


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _get_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return None


def require_bot_runner(request: Request) -> str:
    token = _get_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Runner token missing")

    key = _env("RUNNER_JWT_SIGNING_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="RUNNER_JWT_SIGNING_KEY not configured")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["HS256"],
            issuer=_env("RUNNER_JWT_ISSUER", "ustock-backend"),
            audience=_env("RUNNER_JWT_AUDIENCE", "ustock-runner"),
            options={"require": ["exp", "iat", "iss", "aud"]},
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid runner token")

    runner_id = str(claims.get("sub") or "").strip()
    if not runner_id:
        raise HTTPException(status_code=401, detail="Invalid runner token")

    return runner_id
