# api/alpaca_data.py
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from typing import Tuple

from fastapi import APIRouter, HTTPException, Request, Response

from .core.security import require_user, decrypt_secret, get_supabase_service
from .clients.alpaca_client import stock_bars, crypto_bars

router = APIRouter(prefix="/alpaca", tags=["alpaca"])


def _env() -> tuple[str, str]:
    """
    Read env at call-time (not import-time) to avoid stale values in tests/serverless.
    Returns: (data_base_url, stock_feed)
    """
    base = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip()
    feed = os.getenv("ALPACA_STOCK_FEED", "iex").strip().lower() or "iex"
    return base, feed


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _clamp_limit(limit: int, lo: int = 10, hi: int = 1000) -> int:
    try:
        v = int(limit)
    except Exception:
        v = 200
    return max(lo, min(v, hi))


def _load_alpaca_keys(sb, user_id: str) -> Tuple[str, str, str]:
    try:
        res = (
            sb.table("integrations")
            .select("api_key_enc,api_secret_enc,mode,status")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .limit(1)
            .execute()
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "SUPABASE_QUERY_FAILED",
                "message": "Failed reading integrations",
                "hint": "Check Supabase keys",
                "raw": repr(e),
            },
        )

    rows = res.data or []
    row = rows[0] if rows else None
    if not row:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ALPACA_NOT_CONNECTED",
                "message": "Alpaca not connected for this user",
                "hint": "Connect Alpaca in Connected Apps.",
            },
        )

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ALPACA_NOT_CONNECTED",
                "message": "Alpaca is not marked connected",
                "hint": "Reconnect Alpaca in Connected Apps.",
            },
        )

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = str(row.get("mode") or "paper").lower().strip()
    if mode not in ("paper", "live"):
        mode = "paper"

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ALPACA_KEYS_MISSING",
                "message": "Alpaca keys missing or unreadable",
                "hint": "Reconnect Alpaca in Connected Apps.",
            },
        )

    return api_key, api_secret, mode


@router.get("/bars/daily")
def get_daily_bars(symbol: str, request: Request, response: Response, limit: int = 200):
    try:
        user = require_user(request, response)
        user_id = user["id"]

        sym = (symbol or "").upper().strip()
        if not sym:
            raise HTTPException(status_code=400, detail={"code": "BAD_REQUEST", "message": "symbol is required"})

        limit_n = _clamp_limit(limit, 10, 1000)
        start = _iso(datetime.now(timezone.utc) - timedelta(days=limit_n * 3))

        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user_id)

        base_url, stock_feed = _env()

        payload = stock_bars(
            symbol=sym,
            api_key=api_key,
            api_secret=api_secret,
            timeframe="1Day",
            start=start,
            limit=limit_n,
            adjustment="raw",
            feed=stock_feed,
            base_url=base_url,
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
            if isinstance(b, dict)
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
                "feed_used": (payload.get("meta") or {}).get("feed_used") or stock_feed,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "ALPACA_DAILY_BARS_FAILED",
                "message": "Daily bars failed",
                "hint": "Check backend logs",
                "raw": repr(e),
            },
        )


@router.get("/crypto/bars/daily")
def get_crypto_daily_bars(symbol: str, request: Request, response: Response, limit: int = 200):
    try:
        user = require_user(request, response)
        user_id = user["id"]

        sym = (symbol or "").upper().strip()
        if not sym or "/" not in sym:
            raise HTTPException(
                status_code=400,
                detail={"code": "BAD_REQUEST", "message": "symbol is required (ex: BTC/USD)"},
            )

        limit_n = _clamp_limit(limit, 10, 1000)
        start = _iso(datetime.now(timezone.utc) - timedelta(days=limit_n * 3))

        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user_id)

        base_url, _stock_feed = _env()

        payload = crypto_bars(
            symbols=[sym],
            api_key=api_key,
            api_secret=api_secret,
            timeframe="1Day",
            start=start,
            limit=limit_n,
            base_url=base_url,
        )

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
            if isinstance(b, dict)
        ]

        return {
            "ok": True,
            "symbol": sym,
            "mode": mode,
            "count": len(out),
            "bars": out,
            "meta": {"fetchedAt": _iso(datetime.now(timezone.utc)), "source": "alpaca"},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "code": "ALPACA_CRYPTO_BARS_FAILED",
                "message": "Crypto bars failed",
                "hint": "Check backend logs",
                "raw": repr(e),
            },
        )
