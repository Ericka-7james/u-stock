# backend/api/routes/bots/runner_routes.py

"""Runner-authenticated bot routes.

This module contains endpoints used by trusted bot runners to report
heartbeat state, retrieve runner-visible status, and submit generated
intents.

Authentication model:
    These endpoints rely on runner authentication and signed claims rather
    than the cookie-based UI auth flow.

Security model:
    Runner JWTs are expected to use:
        - `sub` for the runner id
        - `uid` for the bound application user id

    This module intentionally does not treat `sub` as a user id.

Route mounting:
    These routes are mounted under `/api/bots` by the package router.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from api.core.bots.service import BotService
from api.routes.bots.deps import get_bot_service
from api.routes.bots.utils import require_bot_id, require_payload_obj, safe_int
from api.security.bot_runner_dep import (
    enforce_runner_user,
    require_bot_runner,
    require_bot_runner_claims,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _require_runner_uid_claim(claims: Dict[str, Any]) -> str:
    """Returns the authenticated application user id from runner claims."""
    uid = str(claims.get("uid") or claims.get("user_id") or "").strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="runner token missing uid",
        )
    return uid


def _resolve_runner_user_id(*, body: Dict[str, Any], claims: Dict[str, Any]) -> str:
    """Resolves the authenticated user id for a runner-authenticated request."""
    uid = _require_runner_uid_claim(claims)

    payload_user_id = str(body.get("user_id") or "").strip()
    if payload_user_id:
        enforce_runner_user(payload_user_id=payload_user_id, claims=claims)

    return uid


def _runner_status_response(
    *,
    service_response: Dict[str, Any],
    runner_id: str,
    user_id: str,
    bot_id: str,
) -> Dict[str, Any]:
    """Builds a runner-facing status response."""
    out = dict(service_response) if isinstance(service_response, dict) else {}
    out.setdefault("runner_id", runner_id)
    out.setdefault("user_id", user_id)
    out.setdefault("bot_id", bot_id)
    return out


def _require_items_list(raw_items: Any) -> List[Any]:
    """Validates and returns the submitted intents list."""
    items = raw_items or []
    if not isinstance(items, list):
        logger.warning("Runner submitted non-list intents payload")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="items must be a list",
        )
    return items


@router.post("/heartbeat")
def heartbeat(
    payload: Any = Body(...),
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Accepts a heartbeat from an authenticated runner."""
    body = require_payload_obj(payload)
    bid = require_bot_id(body.get("bot_id"))
    uid = _resolve_runner_user_id(body=body, claims=claims)

    safe_payload = dict(body)
    safe_payload["bot_id"] = bid
    safe_payload["runner_id"] = runner_id
    safe_payload["user_id"] = uid

    logger.info(
        "Accepted runner heartbeat",
        extra={
            "runner_id": runner_id,
            "bot_id": bid,
            "user_id": uid,
            "mode": str(safe_payload.get("mode") or "").strip().lower() or None,
            "runtime_state": str(
                safe_payload.get("runtime_state") or safe_payload.get("effective_state") or ""
            ).strip().lower()
            or None,
        },
    )

    result = svc.heartbeat(uid, safe_payload)

    if not isinstance(result, dict):
        logger.error(
            "BotService heartbeat returned non-dict result",
            extra={
                "runner_id": runner_id,
                "bot_id": bid,
                "user_id": uid,
                "result_type": type(result).__name__,
            },
        )
        return {
            "ok": False,
            "bot_id": bid,
            "detail": "heartbeat returned invalid response",
        }

    return result

@router.get("/status_runner")
def status_runner(
    bot_id: str = Query(..., description="Bot identifier."),
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Returns bot status for an authenticated runner.

    This endpoint is bound to the authenticated application user carried in
    the runner JWT `uid` claim.
    """
    bid = require_bot_id(bot_id)
    uid = _require_runner_uid_claim(claims)

    out = _runner_status_response(
        service_response=svc.status(uid, bid),
        runner_id=runner_id,
        user_id=uid,
        bot_id=bid,
    )

    logger.info(
        "Returned runner bot status",
        extra={
            "runner_id": runner_id,
            "bot_id": bid,
            "user_id": uid,
        },
    )

    return out


@router.post("/submit-intents")
def submit_intents(
    payload: Any = Body(...),
    runner_id: str = Depends(require_bot_runner),
    claims: Dict[str, Any] = Depends(require_bot_runner_claims),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Submits latest runner-generated intents.

    If the payload supplies `user_id`, it is checked against the JWT uid claim
    when uid enforcement is enabled. The effective user id is always sourced
    from the verified claims.
    """
    body = require_payload_obj(payload)
    bid = require_bot_id(body.get("bot_id"))
    uid = _resolve_runner_user_id(body=body, claims=claims)

    ts_int = safe_int(body.get("ts"), 0)
    items = _require_items_list(body.get("items"))

    logger.info(
        "Accepted runner intents",
        extra={
            "runner_id": runner_id,
            "bot_id": bid,
            "user_id": uid,
            "count": len(items),
            "ts": ts_int,
        },
    )

    return svc.submit_intents(uid, bid, ts_int, items)