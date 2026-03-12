# backend/api/routes/bots/cookie_routes.py

"""Cookie-authenticated bot routes.

This module contains UI-facing endpoints for listing bots, checking status,
controlling execution, and retrieving logs and activity feeds.

Authentication model:
    These endpoints expect the caller to be authenticated through the normal
    cookie/session flow used by the web application.

Route mounting:
    These routes are mounted under `/api/bots` by the package router.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request, Response

from api.core.bots.service import BotService
from api.core.bots.validators import normalize_mode, parse_ts_to_epoch_seconds
from api.db import get_supabase_service
from api.routes.bots.deps import get_bot_service, require_cookie_user_id
from api.routes.bots.utils import (
    as_dict,
    epoch_to_iso_z,
    extract_rows,
    require_bot_id,
    require_payload_obj,
    safe_int,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def _ts_to_epoch(ts_value: Any) -> int:
    """Converts a timestamp-like value into epoch seconds."""
    ts_epoch = safe_int(ts_value, 0)
    if ts_epoch:
        return ts_epoch
    return safe_int(parse_ts_to_epoch_seconds(ts_value), 0)


def _build_log_item(row: Dict[str, Any]) -> Dict[str, Any]:
    """Builds a UI-friendly log/event item from a bot_logs row."""
    details = row.get("details")
    if not isinstance(details, dict):
        details = {}

    user_message = str(row.get("user_message") or "").strip()
    technical_message = str(row.get("technical_message") or "").strip()
    legacy_message = str(row.get("message") or "").strip()

    message = user_message or technical_message or legacy_message or ""
    if not message:
        action = str(row.get("action") or "log").strip().replace("_", " ")
        source = str(row.get("source") or "system").strip()
        message = f"{source}: {action}".strip(": ")

    return {
        "ts": _ts_to_epoch(row.get("ts")),
        "level": str(row.get("level") or "info").strip().lower(),
        "source": str(row.get("source") or "system").strip().lower(),
        "action": str(row.get("action") or "log").strip().lower(),
        "status": str(row.get("status") or "info").strip().lower(),
        "visible_to_user": bool(row.get("visible_to_user", True)),
        "message": message,
        "user_message": user_message,
        "technical_message": technical_message,
        "request_id": str(row.get("request_id") or "").strip() or None,
        "runner_id": str(row.get("runner_id") or "").strip() or None,
        "desired_state": str(row.get("desired_state") or "").strip() or None,
        "runtime_state": str(row.get("runtime_state") or "").strip() or None,
        "details": details,
    }


@router.get("/")
def list_bots(svc: BotService = Depends(get_bot_service)) -> Dict[str, Any]:
    """Lists available bots for the dashboard."""
    return svc.available()


@router.get("/available")
def available(svc: BotService = Depends(get_bot_service)) -> Dict[str, Any]:
    """Lists available bots."""
    return svc.available()


@router.get("/status")
def status(
    request: Request,
    response: Response,
    bot_id: str = Query(..., description="Bot identifier."),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Returns the current bot status for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    bid = require_bot_id(bot_id)
    return svc.status(user_id, bid)


@router.post("/arm")
def arm(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Arms a bot for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    body = require_payload_obj(payload)

    bid = require_bot_id(body.get("bot_id"))
    mode = body.get("mode")
    mode_norm = normalize_mode(mode) if mode is not None else None

    return svc.arm(user_id, bid, mode_norm)


@router.post("/disarm")
def disarm(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Disarms a bot for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    body = require_payload_obj(payload)

    bid = require_bot_id(body.get("bot_id"))
    return svc.disarm(user_id, bid)


@router.post("/start")
def start(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Starts a bot for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    body = require_payload_obj(payload)

    bid = require_bot_id(body.get("bot_id"))
    mode = normalize_mode(body.get("mode") or "paper")

    return svc.start(user_id, bid, mode)


@router.post("/stop")
def stop(
    request: Request,
    response: Response,
    payload: Optional[Dict[str, Any]] = None,
    bot_id: Optional[str] = Query(None, description="Optional bot identifier."),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Stops a bot for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    body = as_dict(payload)

    raw_bot_id = bot_id or body.get("bot_id")
    bid = require_bot_id(raw_bot_id)

    return svc.stop(user_id, bid)


@router.get("/log")
def log(
    request: Request,
    response: Response,
    bot_id: str = Query(..., description="Bot identifier."),
    mode: str = Query("paper", description="paper|live"),
    limit: int = Query(50, ge=1, le=300),
    start_ts: int = Query(0, ge=0, description="Epoch seconds inclusive. 0 means no lower bound."),
    end_ts: int = Query(0, ge=0, description="Epoch seconds inclusive. 0 means no upper bound."),
    svc: BotService = Depends(get_bot_service),
) -> Dict[str, Any]:
    """Returns bot log entries for the authenticated user."""
    user_id = require_cookie_user_id(request, response)
    bid = require_bot_id(bot_id)
    normalized_mode = normalize_mode(mode)

    return svc.get_log(
        user_id,
        bid,
        mode=normalized_mode,
        limit=int(limit),
        start_ts=int(start_ts or 0),
        end_ts=int(end_ts or 0),
    )


@router.get("/intents")
def intents_snapshot(
    request: Request,
    response: Response,
    bot_id: str = Query(..., description="Bot identifier."),
    limit: int = Query(10, ge=1, le=10),
) -> Dict[str, Any]:
    """Returns the most recent intent-summary logs for a bot."""
    user_id = require_cookie_user_id(request, response)
    bid = require_bot_id(bot_id)
    sb = get_supabase_service()

    try:
        result = (
            sb.table("bot_logs")
            .select("ts,details,action,source")
            .eq("user_id", user_id)
            .eq("bot_id", bid)
            .eq("source", "runner")
            .order("ts", desc=True)
            .limit(50)
            .execute()
        )

        rows = extract_rows(result)

        for row in rows:
            if not isinstance(row, dict):
                continue

            details = row.get("details")
            if not isinstance(details, dict):
                continue

            preview = details.get("preview")
            count = safe_int(details.get("count"), 0)

            if isinstance(preview, list):
                return {
                    "ok": True,
                    "bot_id": bid,
                    "count": count if count > 0 else len(preview),
                    "ts": _ts_to_epoch(row.get("ts")),
                    "items": preview[: int(limit)],
                }

        return {
            "ok": True,
            "bot_id": bid,
            "count": 0,
            "ts": 0,
            "items": [],
        }

    except Exception:
        logger.exception(
            "Failed to fetch bot intents snapshot",
            extra={"user_id": user_id, "bot_id": bid, "limit": limit},
        )
        return {
            "ok": False,
            "bot_id": bid,
            "count": 0,
            "ts": 0,
            "items": [],
            "error": "failed_to_fetch_intents",
        }


@router.get("/events")
def events_feed(
    request: Request,
    response: Response,
    bot_id: str = Query(..., description="Bot identifier."),
    mode: str = Query("paper", description="paper|live"),
    limit: int = Query(60, ge=1, le=300),
    before_ts: int = Query(0, ge=0, description="Return records older than this timestamp."),
    start_ts: int = Query(0, ge=0, description="Epoch seconds inclusive. 0 means no lower bound."),
    end_ts: int = Query(0, ge=0, description="Epoch seconds inclusive. 0 means no upper bound."),
) -> Dict[str, Any]:
    """Returns a paginated activity feed for a bot."""
    user_id = require_cookie_user_id(request, response)
    bid = require_bot_id(bot_id)
    normalized_mode = normalize_mode(mode)
    sb = get_supabase_service()

    try:
        query = (
            sb.table("bot_logs")
            .select(
                "ts,level,source,action,status,visible_to_user,"
                "user_message,technical_message,request_id,runner_id,"
                "desired_state,runtime_state,details,message"
            )
            .eq("user_id", user_id)
            .eq("bot_id", bid)
            .order("ts", desc=True)
            .limit(int(limit))
        )

        if before_ts > 0:
            query = query.lt("ts", epoch_to_iso_z(before_ts))

        if end_ts > 0:
            query = query.lt("ts", epoch_to_iso_z(end_ts + 1))

        if start_ts > 0:
            query = query.gte("ts", epoch_to_iso_z(start_ts))

        result = query.execute()
        rows = extract_rows(result)

        items: List[Dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue

            details = row.get("details")
            if not isinstance(details, dict):
                details = {}

            row_mode = str(details.get("mode") or "").strip().lower()
            if row_mode and row_mode != normalized_mode:
                continue

            items.append(_build_log_item(row))

        next_before_ts = safe_int(items[-1]["ts"], 0) if items else 0

        return {
            "ok": True,
            "bot_id": bid,
            "mode": normalized_mode,
            "items": items,
            "next_before_ts": next_before_ts,
        }

    except Exception:
        logger.exception(
            "Failed to fetch bot events",
            extra={
                "user_id": user_id,
                "bot_id": bid,
                "mode": normalized_mode,
                "limit": limit,
                "before_ts": before_ts,
                "start_ts": start_ts,
                "end_ts": end_ts,
            },
        )
        return {
            "ok": False,
            "bot_id": bid,
            "mode": normalized_mode,
            "items": [],
            "error": "failed_to_fetch_events",
        }