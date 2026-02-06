# backend/api/routes/trade_fills.py
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.deps import require_user
from api.security.bot_runner_dep import require_bot_runner
from api.supabase_client import supabase_admin_client

router = APIRouter(tags=["trade-fills"])


# -------------------------
# User-facing (cookies)
# -------------------------
@router.get("/api/trade_fills")
def list_trade_fills(
    user=Depends(require_user),
    limit: int = Query(50, ge=1, le=500),
    bot_id: Optional[str] = None,
    symbol: Optional[str] = None,
    provider: Optional[str] = None,
):
    """
    User-facing endpoint (cookies). Filters by user_id.
    """
    sb = supabase_admin_client()

    q = (
        sb.table("trade_fills")
        .select("*")
        .eq("user_id", user["id"])
        .order("filled_at", desc=True)
        .limit(limit)
    )

    if bot_id:
        q = q.eq("bot_id", bot_id)
    if symbol:
        q = q.eq("symbol", symbol.upper())
    if provider:
        q = q.eq("provider", provider.lower())

    res = q.execute()
    if getattr(res, "error", None):
        raise HTTPException(status_code=400, detail=str(res.error))

    return {"items": res.data or []}


# -------------------------
# Runner-facing (Bearer token)
# -------------------------
class SyncRunnerIn(BaseModel):
    bot_id: str = Field(..., min_length=1)
    mode: str = Field(..., pattern=r"^(paper|live)$")


@router.post("/api/trade_fills/sync_runner")
def sync_trade_fills_runner(
    body: SyncRunnerIn,
    runner_user_id: str = Depends(require_bot_runner),
):
    """
    Runner-facing endpoint (Bearer token). Used by the bot runner to
    sync fills into trade_fills.

    Security:
      - Bearer token validated by require_bot_runner
      - user_id is derived from token sub (runner_user_id)
      - runner never submits user_id
    """
    user_id = runner_user_id  # ✅ derived from token sub
    bot_id = str(body.bot_id).strip()
    mode = str(body.mode).strip().lower()

    # TODO: implement the real sync:
    # - fetch fills from Alpaca for (user_id, bot_id, mode)
    # - upsert into trade_fills
    #
    # For now return a stub so you can wire runner + endpoint end-to-end.
    return {
        "ok": True,
        "status": "not_implemented_yet",
        "user_id": user_id,
        "bot_id": bot_id,
        "mode": mode,
    }
