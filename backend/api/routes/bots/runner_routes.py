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
    """Returns the authenticated application user id from runner claims.

    Runner JWTs use `sub` for the runner id, so this helper only accepts a
    user id from the dedicated `uid` claim or legacy `user_id` claim.

    Args:
        claims: Decoded runner JWT claims.

    Raises:
        HTTPException: If no usable user id is present in the claims.

    Returns:
        str: Authenticated application user id.
    """
    uid = str(claims.get("uid") or claims.get("user_id") or "").strip()
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="runner token missing uid",
        )
    return uid


def _resolve_runner_user_id(*, body: Dict[str, Any], claims: Dict[str, Any]) -> str:
    """Resolves the authenticated user id for a runner-authenticated request.

    The effective user id is always sourced from verified JWT claims. If the
    request payload also supplies a user id, it is optionally enforced against
    the JWT `uid` claim via the shared runner auth enforcement hook.

    Args:
        body: Validated request payload.
        claims: Decoded runner JWT claims.

    Raises:
        HTTPException: If the runner token is not bound to a user or if the
            payload user id does not match the enforced JWT claim.

    Returns:
        str: Effective authenticated application user id.
    """
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
    """Builds a runner-facing status response.

    Args:
        service_response: Response returned by the bot service.
        runner_id: Authenticated runner id.
        user_id: Authenticated application user id.
        bot_id: Validated bot identifier.

    Returns:
        Dict[str, Any]: Response enriched with runner context.
    """
    out = dict(service_response) if isinstance(service_response, dict) else {}
    out.setdefault("runner_id", runner_id)
    out.setdefault("user_id", user_id)
    out.setdefault("bot_id", bot_id)
    return out


def _require_items_list(raw_items: Any) -> List[Any]:
    """Validates and returns the submitted intents list.

    Args:
        raw_items: Raw `items` field from the request payload.

    Raises:
        HTTPException: If `items` is not a list.

    Returns:
        List[Any]: Submitted intents list.
    """
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
    """Accepts a heartbeat from an authenticated runner.

    The heartbeat is bound to the authenticated user from the runner JWT. If
    uid-claim enforcement is enabled, any provided payload user id must match
    the JWT uid claim.

    Args:
        payload: Incoming heartbeat request body.
        runner_id: Authenticated runner id from JWT `sub`.
        claims: Decoded runner JWT claims.
        svc: Bot service dependency.

    Raises:
        HTTPException: If the payload is invalid, the bot id is invalid, or
            the runner token is not bound to a user.

    Returns:
        Dict[str, Any]: Service heartbeat response.
    """
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
        },
    )

    return svc.heartbeat(uid, safe_payload)


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

    Args:
        bot_id: Bot identifier.
        runner_id: Authenticated runner id from JWT `sub`.
        claims: Decoded runner JWT claims.
        svc: Bot service dependency.

    Raises:
        HTTPException: If the bot id is invalid or the runner token is not
            bound to a user.

    Returns:
        Dict[str, Any]: Current bot status response.
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

    Args:
        payload: Incoming intents request body.
        runner_id: Authenticated runner id from JWT `sub`.
        claims: Decoded runner JWT claims.
        svc: Bot service dependency.

    Raises:
        HTTPException: If the payload is invalid, bot id is invalid, items is
            not a list, or the runner token is not bound to a user.

    Returns:
        Dict[str, Any]: Service response for submitted intents.
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