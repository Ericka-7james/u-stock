# backend/api/routes/auth_bot_runner.py
from __future__ import annotations

import os
import time
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import jwt

router = APIRouter(prefix="/api/runner", tags=["runner-auth"])

_RUNNER_ID_RE = re.compile(r"^[a-zA-Z0-9._:@-]{1,200}$")


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


def _env_int(name: str, default: int) -> int:
    raw = _env(name, "")
    if raw == "":
        return int(default)
    try:
        return int(raw)
    except Exception:
        return int(default)


def _get_runner_secret(request: Request) -> str:
    """
    Compat:
      - X-Runner-Secret
      - X-Bot-Runner-Secret
    """
    return (request.headers.get("X-Runner-Secret") or request.headers.get("X-Bot-Runner-Secret") or "").strip()


def _expected_shared_secret() -> str:
    """
    Compat env names:
      - RUNNER_SHARED_SECRET (current)
      - BOT_RUNNER_SECRET (older/back-compat)
    """
    return _env("RUNNER_SHARED_SECRET") or _env("BOT_RUNNER_SECRET")


def _runner_user_id_hint(request: Request) -> Optional[str]:
    """
    Optional:
      If caller provides a user id header, embed it into the JWT claims.

    Header names accepted:
      - X-Runner-User-Id
      - X-Bot-Runner-User-Id
    """
    uid = (request.headers.get("X-Runner-User-Id") or request.headers.get("X-Bot-Runner-User-Id") or "").strip()
    return uid or None


class RunnerTokenIn(BaseModel):
    runner_id: str = Field(..., min_length=1, max_length=200)


class RunnerTokenOut(BaseModel):
    token: str
    expires_in: int


@router.post("/token", response_model=RunnerTokenOut)
def mint_runner_token(payload: RunnerTokenIn, request: Request) -> RunnerTokenOut:
    expected = _expected_shared_secret()
    if not expected:
        raise HTTPException(status_code=500, detail="Runner shared secret not configured")

    got = _get_runner_secret(request)
    if not got or got != expected:
        raise HTTPException(status_code=401, detail="Runner not authenticated")

    signing_key = _env("RUNNER_JWT_SIGNING_KEY")
    if not signing_key:
        raise HTTPException(status_code=500, detail="RUNNER_JWT_SIGNING_KEY not configured")

    runner_id = str(payload.runner_id or "").strip()
    if not runner_id or not _RUNNER_ID_RE.match(runner_id):
        raise HTTPException(status_code=400, detail="Invalid runner_id")

    issuer = _env("RUNNER_JWT_ISSUER", "ustock-backend")
    audience = _env("RUNNER_JWT_AUDIENCE", "ustock-runner")

    # TTL hardening: clamp
    ttl = _env_int("RUNNER_JWT_TTL_SECONDS", 600)
    ttl = max(60, min(ttl, 3600))  # 1 min .. 1 hour

    now = int(time.time())

    claims = {
        "sub": runner_id,
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + ttl,
        "scope": "runner",
    }

    # Optional: bind token to a user id (recommended)
    uid = _runner_user_id_hint(request)
    if uid:
        # TODO: validate uid format (uuid) if you want strictness
        claims["uid"] = uid

    token = jwt.encode(claims, signing_key, algorithm="HS256")
    return RunnerTokenOut(token=str(token), expires_in=int(ttl))


"""
NEXT SECURITY STEP (recommended):
1) Ensure runner includes X-Runner-User-Id when minting token (api_client _mint_runner_token).
2) Turn on enforcement:
     RUNNER_ENFORCE_UID_CLAIM=true
   This will require payload user_id == claims['uid'] in /api/bots/heartbeat, /submit-intents, /status_runner.
"""
