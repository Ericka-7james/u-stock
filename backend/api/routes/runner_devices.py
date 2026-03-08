# backend/api/routes/runner_devices.py
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel

from api.deps import require_user
from api.security.bot_runner_token import (
    load_bot_runner_config,
    start_pairing,
    complete_pairing,
    mint_access_from_refresh,
)

router = APIRouter(prefix="/api/runner", tags=["runner-devices"])


class StartPairReq(BaseModel):
    device_id: str
    bot_id: str = "ema_trend"
    display_name: Optional[str] = None


class CompletePairReq(BaseModel):
    device_id: str
    pair_code: str


class RefreshReq(BaseModel):
    device_id: str
    refresh_token: str
    bot_id: str = "ema_trend"


@router.post("/pair/start")
def pair_start(req: StartPairReq, request: Request, response: Response) -> Dict[str, Any]:
    u = require_user(request, response)
    uid = str(u.get("id") or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="unauthorized")

    cfg = load_bot_runner_config()
    return start_pairing(
        user_id=uid,
        device_id=req.device_id,
        bot_id=req.bot_id,
        display_name=req.display_name,
        cfg=cfg,
    )


@router.post("/pair/complete")
def pair_complete(req: CompletePairReq) -> Dict[str, Any]:
    """
    Expected response (from complete_pairing):
      { ok: true, device_id, refresh_token, ... }
    The refresh_token is what the runner stores (per profile) for multi-user.
    """
    cfg = load_bot_runner_config()
    return complete_pairing(device_id=req.device_id, pair_code=req.pair_code, cfg=cfg)


@router.post("/token/refresh")
def token_refresh(req: RefreshReq) -> Dict[str, Any]:
    """
    Exchange refresh_token -> short-lived access JWT.
    Access JWT must include uid/sub (user) and did (device) so backend can derive user_id.
    """
    cfg = load_bot_runner_config()
    return mint_access_from_refresh(
        refresh_token=req.refresh_token,
        device_id=req.device_id,
        bot_id=req.bot_id,
        cfg=cfg,
    )