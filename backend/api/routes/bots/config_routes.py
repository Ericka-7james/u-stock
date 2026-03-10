# backend/api/routes/bots/config_routes.py

"""Bot configuration routes.

This module contains cookie-authenticated endpoints used by the web UI to
retrieve and update per-user bot configuration.

These routes are mounted under the shared `/api/bots` prefix by the package
router in `api.routes.bots.__init__`.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from api.core.bots.service import BotService
from api.routes.bots.deps import get_bot_service, require_cookie_user_id
from api.routes.bots.utils import require_bot_id, require_payload_obj

router = APIRouter()


@router.get("/config")
def get_config(
    request: Request,
    response: Response,
    bot_id: str = Query(..., description="Bot identifier."),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Returns bot configuration for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    bid = require_bot_id(bot_id)
    return svc.get_config(user_id, bid)


@router.post("/config")
def set_config(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Updates bot configuration for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    body = require_payload_obj(payload)

    bid = require_bot_id(body.get("bot_id"))
    config = body.get("config")
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="config must be an object")

    return svc.set_config(user_id, bid, config)