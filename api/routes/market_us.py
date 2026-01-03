# api/routes/market_us.py
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Response, Query
from typing import List

from .core.security import require_user, get_supabase_service, decrypt_secret
from .clients.alpaca_client import latest_quotes, recent_trades

router = APIRouter(prefix="/api/market/us", tags=["market-us"])

def _load_alpaca_keys(user_id: str):
    sb = get_supabase_service()
    res = (
        sb.table("integrations")
        .select("api_key_enc,api_secret_enc,status")
        .eq("user_id", user_id)
        .eq("provider", "alpaca")
        .limit(1)
        .execute()
    )
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(status_code=409, detail="Alpaca is not connected. Connect it in Connected Apps.")
    if str(row.get("status","")).lower() != "connected":
        raise HTTPException(status_code=409, detail="Alpaca is not marked connected.")

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    if not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="Alpaca keys missing/unreadable.")
    return api_key, api_secret

@router.get("/quotes/latest")
def get_latest_quotes(
    request: Request,
    response: Response,
    symbols: List[str] = Query(..., description="Repeat: ?symbols=SPY&symbols=QQQ"),
    feed: str = "sip",
):
    user = require_user(request, response)
    api_key, api_secret = _load_alpaca_keys(user["id"])

    syms = [s.upper().strip() for s in symbols if s and s.strip()]
    if not syms:
        raise HTTPException(status_code=400, detail="symbols is required")

    try:
        data = latest_quotes(syms, api_key, api_secret, feed=feed)
        return {"ok": True, "symbols": syms, "feed_used": data.get("feed") or feed, "data": data, "fetchedAt": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"alpaca_quotes_failed: {repr(e)}")

@router.get("/trades")
def get_trades(symbol: str, request: Request, response: Response, limit: int = 50, feed: str = "sip"):
    user = require_user(request, response)
    api_key, api_secret = _load_alpaca_keys(user["id"])

    sym = (symbol or "").upper().strip()
    if not sym:
        raise HTTPException(status_code=400, detail="symbol is required")
    limit = max(1, min(int(limit), 2000))

    try:
        data = recent_trades(sym, api_key, api_secret, limit=limit, feed=feed)
        return {"ok": True, "symbol": sym, "feed_used": data.get("feed") or feed, "data": data, "fetchedAt": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"alpaca_trades_failed: {repr(e)}")
