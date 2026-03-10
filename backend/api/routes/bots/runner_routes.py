# backend/api/routes/bots/runner_routes.py

"""Runner-authenticated bot routes.

This module contains endpoints used by trusted bot runners to report
heartbeat state, retrieve runner-visible status, and submit generated
intents.

Authentication model:
    These endpoints rely on runner authentication and signed claims rather
    than the cookie-based UI auth flow.

Route mounting:
    These routes are mounted under `/api/bots` by the package router.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query

from api.core.bots.service import BotService
from api.routes.bots.deps import (
    get_bot_service,
    require_uid_from_claims,
    runner_effective_user_id,
)
from api.routes.bots.utils import require_bot_id, require_payload_obj, safe_int
from api.security.bot_runner_dep import require_bot_runner, require_bot_runner_claims

router = APIRouter()


@router.post("/heartbeat")
def heartbeat(
    payload: Dict[str, Any],
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Accepts a heartbeat from an authenticated runner."""
    body = require_payload_obj(payload)
    bid = require_bot_id(body.get("bot_id"))
    uid = require_uid_from_claims(claims)

    safe_payload = dict(body)
    safe_payload["bot_id"] = bid
    safe_payload["runner_id"] = runner_id
    safe_payload["user_id"] = uid

    return svc.heartbeat(uid, safe_payload)


@router.get("/status_runner")
def status_runner(
    bot_id: str = Query(..., description="Bot identifier."),
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Returns bot status for an authenticated runner."""
    bid = require_bot_id(bot_id)
    uid = require_uid_from_claims(claims)

    out = svc.status(uid, bid)
    if isinstance(out, dict):
        out.setdefault("runner_id", runner_id)
        out.setdefault("user_id", uid)
        out.setdefault("bot_id", bid)
    return out


@router.post("/submit-intents")
def submit_intents(
    payload: Dict[str, Any],
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Submits latest runner-generated intents."""
    del runner_id

    body = require_payload_obj(payload)
    bid = require_bot_id(body.get("bot_id"))
    uid = runner_effective_user_id(claims=claims, fallback_user_id=body.get("user_id"))

    ts_int = safe_int(body.get("ts"), 0)
    items = body.get("items") or []

    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be a list")

    return svc.submit_intents(uid, bid, ts_int, items)