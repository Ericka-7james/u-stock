# api/routes/auth_bot_runner.py
from __future__ import annotations

from fastapi import APIRouter, Request, Response, HTTPException

from api.deps import require_user
from api.core.errors import http_error
from api.security.bot_runner_token import load_bot_runner_config, mint_bot_runner_token

router = APIRouter()


@router.post("/auth/bot-runner-token")
def create_bot_runner_token(request: Request, response: Response):
    """
    Uses cookie session auth (require_user) to mint a short-lived Bearer token
    for local bot runner usage.
    """
    u = require_user(request, response)
    user_id = u["id"]

    try:
        cfg = load_bot_runner_config()
        return mint_bot_runner_token(user_id, cfg)
    except HTTPException:
        raise
    except Exception as e:
        raise http_error(
            500,
            "BOT_RUNNER_TOKEN_MINT_FAILED",
            "Could not mint bot runner token.",
            detail={"error": repr(e)},
            hint="Check server logs and BOT_RUNNER_* env vars.",
        )
