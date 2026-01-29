from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse

from api.deps import require_user
from api.security.bot_runner_dep import require_bot_runner
from api.core.bots.validators import clean_bot_id, normalize_mode
from api.core.bots.service import BotService

router = APIRouter(prefix="/api/bots", tags=["bots"])


def get_bot_service() -> BotService:
    # Lazily construct so env is loaded first (and avoids import-time DB calls)
    return BotService()


@router.get("/available")
def available(svc: BotService = Depends(get_bot_service)):
    return svc.available()


@router.get("/status")
def status(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.status(user_id, bid)


@router.get("/log")
def log(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    limit: int = Query(50, ge=1, le=300),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.get_log(user_id, bid, limit=int(limit))


@router.post("/start")
def start(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    mode = normalize_mode(payload.get("mode"))
    return svc.start(user_id, bid, mode)


@router.post("/stop")
def stop(
    request: Request,
    response: Response,
    payload: Optional[Dict[str, Any]] = None,
    bot_id: Optional[str] = Query(None),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    raw = bot_id or (payload or {}).get("bot_id")
    bid = clean_bot_id(raw)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.stop(user_id, bid)


# -------------------------
# Runner-only endpoints (Bearer token)
# -------------------------

@router.post("/heartbeat")
def heartbeat(
    payload: Dict[str, Any],
    runner_user_id: str = Depends(require_bot_runner),
    svc: BotService = Depends(get_bot_service),
):
    """
    Runner-authenticated endpoint (Bearer token).
    """
    bid = clean_bot_id(payload.get("bot_id"))
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    payload = dict(payload)
    payload["bot_id"] = bid
    return svc.heartbeat(runner_user_id, payload)


@router.get("/status_runner")
def status_runner(
    bot_id: str = Query(...),
    runner_user_id: str = Depends(require_bot_runner),
    svc: BotService = Depends(get_bot_service),
):
    """
    Runner-authenticated endpoint (Bearer token).
    """
    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.status(runner_user_id, bid)


@router.get("/config")
def get_config(
    request: Request,
    response: Response,
    bot_id: str = Query(...),
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(bot_id)
    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})

    return svc.get_config(user_id, bid)


@router.post("/config")
def set_config(
    request: Request,
    response: Response,
    payload: Dict[str, Any],
    svc: BotService = Depends(get_bot_service),
):
    u = require_user(request, response)
    user_id = u["id"]

    bid = clean_bot_id(payload.get("bot_id"))
    config = payload.get("config")

    if not bid:
        return JSONResponse(status_code=400, content={"detail": "bot_id required"})
    if not isinstance(config, dict):
        return JSONResponse(status_code=400, content={"detail": "config must be an object"})

    return svc.set_config(user_id, bid, config)
