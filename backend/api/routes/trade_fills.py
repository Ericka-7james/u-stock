# backend/api/routes/trade_fills.py
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

# These should match your existing auth + supabase helpers.
# Update the import paths to your repo’s real locations.
from api.routes.auth_bot_runner import require_user  # <-- change if different
from api.supabase_client import supabase_admin_client

router = APIRouter()


@router.get("/api/trade_fills")
def list_trade_fills(
    user=Depends(require_user),
    limit: int = Query(50, ge=1, le=500),
    bot_id: Optional[str] = None,
    symbol: Optional[str] = None,
    provider: Optional[str] = None,
):
    """
    User-facing endpoint (cookies). RLS enforces user_id.
    """
    sb = supabase_admin_client()

    q = sb.table("trade_fills").select("*").eq("user_id", user["id"]).order("filled_at", desc=True).limit(limit)

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
