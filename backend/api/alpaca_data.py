# api/alpaca_data.py
import os
import requests
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request, Response
from supabase import Client, create_client


from .core.security import (
    require_user,
    decrypt_secret,
    get_supabase_service,   # ✅ single source of truth
)

router = APIRouter(prefix="/alpaca", tags=["alpaca"])

ALPACA_DATA_BASE_URL = os.getenv(
    "ALPACA_DATA_BASE_URL",
    "https://data.alpaca.markets",
).strip()

def _load_alpaca_keys(sb, user_id: str):
    res = (
        sb.table("integrations")
        .select("api_key_enc,api_secret_enc,mode,status")
        .eq("user_id", user_id)
        .eq("provider", "alpaca")
        .limit(1)
        .execute()
    )

    rows = res.data or []
    row = rows[0] if len(rows) > 0 else None

    if not row:
        raise HTTPException(status_code=400, detail="Alpaca not connected for this user")

    # optional: ensure status is connected
    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not marked connected")

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca keys missing or unreadable")

    return api_key, api_secret, mode

def _alpaca_headers(api_key: str, api_secret: str):
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
    }

@router.get("/bars/daily")
def get_daily_bars(symbol: str, request: Request, response: Response, limit: int = 200):
    try:
        user = require_user(request, response)
        user_id = user["id"]

        symbol = (symbol or "").upper().strip()
        if not symbol:
            raise HTTPException(status_code=400, detail="symbol is required")

        limit = max(10, min(int(limit), 1000))

        # ✅ ADD THIS: give Alpaca a real time window
        start = (datetime.now(timezone.utc) - timedelta(days=limit * 3)).isoformat()

        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user_id)

        url = f"{ALPACA_DATA_BASE_URL}/v2/stocks/{symbol}/bars"
        params = {
            "timeframe": "1Day",
            "limit": limit,
            "start": start,
            "adjustment": "raw",   # ✅ changed from "all"
            "feed": "sip",
        }
        headers = _alpaca_headers(api_key, api_secret)

        r = requests.get(url, params=params, headers=headers, timeout=8)

        if r.status_code >= 400:
            params["feed"] = "iex"
            r = requests.get(url, params=params, headers=headers, timeout=8)

        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Alpaca data error {r.status_code}: {r.text}")

        payload = r.json() or {}
        bars = payload.get("bars") or []

        out = [
            {"time": b.get("t"), "open": b.get("o"), "high": b.get("h"), "low": b.get("l"),
             "close": b.get("c"), "volume": b.get("v")}
            for b in bars
        ]

        return {
            "ok": True,
            "symbol": symbol,
            "mode": mode,
            "count": len(out),
            "bars": out,
            "meta": {"fetchedAt": datetime.now(timezone.utc).isoformat(), "source": "alpaca"},
        }

    except HTTPException:
        raise
    except Exception as e:
        # This will show up in the frontend now
        raise HTTPException(status_code=500, detail=f"alpaca_daily_bars_failed: {repr(e)}")
