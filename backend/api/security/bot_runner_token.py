# api/security/bot_runner_token.py
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Optional, Dict, Any

import jwt  # PyJWT


@dataclass(frozen=True)
class BotRunnerTokenConfig:
    secret: str
    ttl_seconds: int
    issuer: str = "u-stock-backend"


def load_bot_runner_config() -> BotRunnerTokenConfig:
    secret = os.getenv("BOT_RUNNER_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("BOT_RUNNER_JWT_SECRET is not set")

    ttl = int(os.getenv("BOT_RUNNER_JWT_TTL_SECONDS", "900"))
    return BotRunnerTokenConfig(secret=secret, ttl_seconds=ttl)


def mint_bot_runner_token(user_id: str, config: BotRunnerTokenConfig) -> Dict[str, Any]:
    now = int(time.time())
    exp = now + config.ttl_seconds

    payload = {
        "iss": config.issuer,
        "sub": str(user_id),
        "scope": "bot:run",
        "iat": now,
        "exp": exp,
    }

    token = jwt.encode(payload, config.secret, algorithm="HS256")
    return {"token": token, "expires_in": config.ttl_seconds}


def verify_bot_runner_token(token: str, config: BotRunnerTokenConfig) -> Dict[str, Any]:
    payload = jwt.decode(
        token,
        config.secret,
        algorithms=["HS256"],
        options={"require": ["exp", "iat", "sub"]},
        issuer=config.issuer,
    )

    # Ensure scope is correct
    if payload.get("scope") != "bot:run":
        raise jwt.InvalidTokenError("Invalid scope")

    return payload
