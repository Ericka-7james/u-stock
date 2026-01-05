# api/alpaca_data.py
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, HTTPException, Request, Response

from .core.security import (
    require_user,
    decrypt_secret,
    get_supabase_service,
)

from .clients.alpaca_client import stock_bars, crypto_bars

router = APIRouter(prefix="/alpaca", tags=["alpaca"])

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip()


def _load_alpaca_keys(sb, user_id: str) -> Tuple[str, str, str]:
    res = (
        sb.table("integrations")
        .select("api_key_enc,api_secret_enc,mode,status")
        .eq("user_id", user_id)
        .eq("provider", "alpaca")
        .limit(1)
        .execute()
    )

    rows = res.data or []
    row = rows[0] if rows else None
    if not row:
        raise HTTPException(status_code=400, detail="Alpaca not connected for this user")

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not marked connected")

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca keys missing or unreadable")

    return api_key, api_secret, mode


def _clamp_limit(limit: int, lo: int = 10, hi: int = 1000) -> int:
    try:
        v = int(limit)
    except Exception:
        v = 200
    return max(lo, min(v, hi))


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


@router.get("/bars/daily")
def get_daily_bars(symbol: str, request: Request, response: Response, limit: int = 200):
    """
    Stocks daily bars used by frontend:
      GET /api/alpaca/bars/daily?symbol=AAPL&limit=200
    """
    try:
        user = require_user(request, response)
        user_id = user["id"]

        sym = (symbol or "").upper().strip()
        if not sym:
            raise HTTPException(status_code=400, detail="symbol is required")

        limit_n = _clamp_limit(limit, 10, 1000)

        # Give Alpaca a safe time window so you actually get 'limit' bars reliably
        start = _iso(datetime.now(timezone.utc) - timedelta(days=limit_n * 3))

        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user_id)

        payload = stock_bars(
            symbol=sym,
            api_key=api_key,
            api_secret=api_secret,
            timeframe="1Day",
            start=start,
            limit=limit_n,
            adjustment="raw",
            feed="sip",
            base_url=ALPACA_DATA_BASE_URL,
        )

        bars = payload.get("bars") or []
        out = [
            {
                "time": b.get("t"),
                "open": b.get("o"),
                "high": b.get("h"),
                "low": b.get("l"),
                "close": b.get("c"),
                "volume": b.get("v"),
            }
            for b in bars
        ]

        return {
            "ok": True,
            "symbol": sym,
            "mode": mode,
            "count": len(out),
            "bars": out,
            "meta": {
                "fetchedAt": _iso(datetime.now(timezone.utc)),
                "source": "alpaca",
                "feed_used": (payload.get("meta") or {}).get("feed_used"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"alpaca_daily_bars_failed: {repr(e)}")


@router.get("/crypto/bars/daily")
def get_crypto_daily_bars(symbol: str, request: Request, response: Response, limit: int = 200):
    """
    Crypto daily bars (symbol format: BTC/USD, ETH/USD)
      GET /api/alpaca/crypto/bars/daily?symbol=BTC/USD&limit=200
    """
    try:
        user = require_user(request, response)
        user_id = user["id"]

        sym = (symbol or "").upper().strip()
        if not sym or "/" not in sym:
            raise HTTPException(status_code=400, detail="symbol is required (ex: BTC/USD)")

        limit_n = _clamp_limit(limit, 10, 1000)
        start = _iso(datetime.now(timezone.utc) - timedelta(days=limit_n * 3))

        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user_id)

        payload = crypto_bars(
            symbols=[sym],
            api_key=api_key,
            api_secret=api_secret,
            timeframe="1Day",
            start=start,
            limit=limit_n,
            base_url=ALPACA_DATA_BASE_URL,
        )

        # payload["bars"] is a dict keyed by symbol
        bars_by_symbol = payload.get("bars") or {}
        bars = bars_by_symbol.get(sym) or []

        out = [
            {
                "time": b.get("t"),
                "open": b.get("o"),
                "high": b.get("h"),
                "low": b.get("l"),
                "close": b.get("c"),
                "volume": b.get("v"),
            }
            for b in bars
        ]

        return {
            "ok": True,
            "symbol": sym,
            "mode": mode,
            "count": len(out),
            "bars": out,
            "meta": {
                "fetchedAt": _iso(datetime.now(timezone.utc)),
                "source": "alpaca",
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"alpaca_crypto_daily_bars_failed: {repr(e)}")
