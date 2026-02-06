# backend/api/routes/integrations_runner.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

import jwt
from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from api.deps import require_user
from api.security.bot_runner_token import load_bot_runner_config

router = APIRouter(prefix="/api/integrations/runner", tags=["integrations-runner"])


def _cfg_get(cfg: Any, key: str, default: Any = None) -> Any:
    """
    Allows cfg to be dict-like or attribute-like.
    """
    if cfg is None:
        return default
    if isinstance(cfg, dict):
        return cfg.get(key, default)
    return getattr(cfg, key, default)


def _mint_runner_token(*, user_id: str) -> Dict[str, Any]:
    """
    Mint a JWT for runner usage with:
      - sub = user_id (Supabase auth UUID)
      - exp = now + ttl
      - iat, nbf
      - optional issuer/audience if present in config
    """
    cfg = load_bot_runner_config()

    secret = _cfg_get(cfg, "secret", None) or _cfg_get(cfg, "BOT_RUNNER_SECRET", None) or os.getenv("BOT_RUNNER_SECRET")
    if not secret:
        raise RuntimeError("BOT_RUNNER_SECRET is not configured")

    alg = _cfg_get(cfg, "algorithm", None) or _cfg_get(cfg, "alg", None) or "HS256"
    issuer = _cfg_get(cfg, "issuer", None) or os.getenv("BOT_RUNNER_ISSUER") or "u-stock"
    audience = _cfg_get(cfg, "audience", None) or os.getenv("BOT_RUNNER_AUDIENCE") or "runner"

    ttl = _cfg_get(cfg, "ttl_seconds", None)
    if ttl is None:
        ttl = int(os.getenv("BOT_RUNNER_TTL_SECONDS", "604800"))  # default 7 days
    ttl = int(ttl)

    now = int(time.time())
    exp = now + ttl

    claims: Dict[str, Any] = {
        "sub": str(user_id),
        "iat": now,
        "nbf": now,
        "exp": exp,
        "iss": issuer,
        "aud": audience,
        "typ": "bot_runner",
    }

    token = jwt.encode(claims, secret, algorithm=alg)
    return {"token": token, "expires_at": exp, "ttl_seconds": ttl, "issuer": issuer, "audience": audience, "alg": alg}


@router.post("/token")
def mint_token(request: Request, response: Response):
    """
    Cookie-authenticated endpoint.
    Logged-in user can mint a runner token for themselves.

    Response:
      { ok, token, expires_at, ttl_seconds }
    """
    u = require_user(request, response)
    user_id = str(u.get("id") or "").strip()
    if not user_id:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})

    try:
        minted = _mint_runner_token(user_id=user_id)
        return {"ok": True, **minted}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Failed to mint runner token: {type(e).__name__}"})
