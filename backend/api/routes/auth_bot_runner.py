from __future__ import annotations

import os
import time

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

import jwt

router = APIRouter(prefix="/api/runner", tags=["runner-auth"])


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name, default) or "").strip()


class RunnerTokenIn(BaseModel):
    runner_id: str = Field(..., min_length=1, max_length=200)


class RunnerTokenOut(BaseModel):
    token: str
    expires_in: int


@router.post("/token", response_model=RunnerTokenOut)
def mint_runner_token(payload: RunnerTokenIn, request: Request) -> RunnerTokenOut:
    expected = _env("RUNNER_SHARED_SECRET")
    if not expected:
        raise HTTPException(status_code=500, detail="RUNNER_SHARED_SECRET not configured")

    got = (request.headers.get("X-Runner-Secret") or "").strip()
    if not got or got != expected:
        raise HTTPException(status_code=401, detail="Runner not authenticated")

    signing_key = _env("RUNNER_JWT_SIGNING_KEY")
    if not signing_key:
        raise HTTPException(status_code=500, detail="RUNNER_JWT_SIGNING_KEY not configured")

    issuer = _env("RUNNER_JWT_ISSUER", "ustock-backend")
    audience = _env("RUNNER_JWT_AUDIENCE", "ustock-runner")
    ttl = int(_env("RUNNER_JWT_TTL_SECONDS", "600") or 600)

    now = int(time.time())
    claims = {
        "sub": str(payload.runner_id).strip(),
        "iss": issuer,
        "aud": audience,
        "iat": now,
        "exp": now + ttl,
        "scope": "runner",
    }

    token = jwt.encode(claims, signing_key, algorithm="HS256")
    return RunnerTokenOut(token=str(token), expires_in=int(ttl))
