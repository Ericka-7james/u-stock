# api/routes/market_us.py
from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Response, Query
from typing import List, Dict, Any, Tuple
import os
import requests

from api.deps import require_user_or_runner
from api.core.security import get_supabase_service
from api.crypto_utils import decrypt_secret
from api.clients.alpaca_client import latest_quotes, recent_trades

router = APIRouter(prefix="/api/market/us", tags=["market-us"])

ALPACA_DATA_BASE = os.getenv("ALPACA_DATA_BASE", "https://data.alpaca.markets").rstrip("/")


# -----------------------------
# Helpers
# -----------------------------
def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_notice(response: Response, message: str, level: str = "info") -> None:
    """
    Light-weight UI banner hint; NOT relied on for program logic.
    """
    if message:
        response.headers["X-UStock-Notice"] = message
        response.headers["X-UStock-Notice-Level"] = level


def _http_exc(
    status_code: int,
    code: str,
    message: str,
    user_action: str | None = None,
    *,
    source: str = "market_us",
    debug: str | None = None,
):
    """
    Standard structured error payload for frontend.
    """
    detail: Dict[str, Any] = {
        "code": code,
        "message": message,
        "source": source,
    }
    if user_action:
        detail["user_action"] = user_action
    if debug:
        detail["debug"] = debug
    raise HTTPException(status_code=status_code, detail=detail)


def _load_alpaca_keys(user_id: str) -> Tuple[str, str]:
    """
    Always use per-user Alpaca keys stored in Supabase (integrations table).
    Works for both:
      - browser requests (cookie auth)
      - runner requests (runner header + X-Runner-User-Id)
    """
    sb = get_supabase_service()
    try:
        res = (
            sb.table("integrations")
            .select("api_key_enc,api_secret_enc,status")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .limit(1)
            .execute()
        )
    except Exception as e:
        _http_exc(
            500,
            "INTEGRATIONS_DB_FAILED",
            "Could not load Alpaca connection from the server.",
            "Refresh and try again. If it keeps failing, sign out and sign back in.",
            source="market_us._load_alpaca_keys",
            debug=repr(e),
        )

    row = (res.data or [None])[0]
    if not row:
        _http_exc(
            409,
            "ALPACA_NOT_CONNECTED",
            "Alpaca is not connected.",
            "Go to Connected Apps → connect Alpaca (API key + secret).",
            source="market_us._load_alpaca_keys",
        )

    if str(row.get("status", "")).lower() != "connected":
        _http_exc(
            409,
            "ALPACA_NOT_CONNECTED",
            "Alpaca is not marked connected.",
            "Go to Connected Apps → reconnect Alpaca.",
            source="market_us._load_alpaca_keys",
        )

    try:
        api_key = decrypt_secret(row.get("api_key_enc"))
        api_secret = decrypt_secret(row.get("api_secret_enc"))
    except Exception as e:
        # Most common cause: encryption env vars changed or missing
        _http_exc(
            500,
            "ALPACA_KEYS_DECRYPT_FAILED",
            "Saved Alpaca keys can’t be decrypted by the backend.",
            "Reconnect Alpaca in Connected Apps and paste your keys again.",
            source="market_us._load_alpaca_keys",
            debug=f"{type(e).__name__}: {str(e)}",
        )

    if not api_key or not api_secret:
        _http_exc(
            500,
            "ALPACA_KEYS_MISSING",
            "Saved Alpaca keys are missing or unreadable.",
            "Reconnect Alpaca in Connected Apps and paste your keys again.",
            source="market_us._load_alpaca_keys",
        )

    return api_key, api_secret


def _alpaca_intraday_bars(
    symbol: str,
    timeframe: str,
    limit: int,
    api_key: str,
    api_secret: str,
    feed: str = "sip",
) -> Dict[str, List[float]]:
    """
    Alpaca v2 stocks bars endpoint.
    Returns {o,h,l,c} arrays.
    """
    url = f"{ALPACA_DATA_BASE}/v2/stocks/{symbol}/bars"
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "accept": "application/json",
    }
    params = {"timeframe": timeframe, "limit": limit, "adjustment": "raw", "feed": feed}

    r = requests.get(url, headers=headers, params=params, timeout=12)

    # Structured error for common rejection cases
    if r.status_code in (401, 403):
        _http_exc(
            401,
            "ALPACA_KEYS_REJECTED",
            "Alpaca keys rejected.",
            "Reconnect Alpaca in Connected Apps and paste keys again.",
            source="market_us._alpaca_intraday_bars",
            debug=f"status={r.status_code} body={r.text[:200]}",
        )

    # Alpaca sometimes 429 rate limits
    if r.status_code == 429:
        _http_exc(
            429,
            "ALPACA_RATE_LIMITED",
            "Rate-limited by Alpaca.",
            "Wait 15–30 seconds, then try again.",
            source="market_us._alpaca_intraday_bars",
            debug=f"body={r.text[:200]}",
        )

    try:
        r.raise_for_status()
    except Exception as e:
        _http_exc(
            502,
            "ALPACA_BARS_HTTP_FAILED",
            "Market data temporarily unavailable.",
            "Try again in a moment.",
            source="market_us._alpaca_intraday_bars",
            debug=repr(e),
        )

    data = r.json() or {}
    bars = data.get("bars") or []

    o = [float(b["o"]) for b in bars if isinstance(b, dict) and "o" in b]
    h = [float(b["h"]) for b in bars if isinstance(b, dict) and "h" in b]
    l = [float(b["l"]) for b in bars if isinstance(b, dict) and "l" in b]
    c = [float(b["c"]) for b in bars if isinstance(b, dict) and "c" in b]

    return {"o": o, "h": h, "l": l, "c": c}


# -----------------------------
# Endpoints
# -----------------------------
@router.get("/quotes/latest")
def get_latest_quotes(
    request: Request,
    response: Response,
    symbols: List[str] = Query(..., description="Repeat: ?symbols=SPY&symbols=QQQ"),
    feed: str = "sip",
):
    user = require_user_or_runner(request, response)

    syms = [s.upper().strip() for s in symbols if s and s.strip()]
    if not syms:
        _http_exc(400, "SYMBOLS_REQUIRED", "symbols is required.", "Provide one or more symbols.", source="market_us.get_latest_quotes")

    api_key, api_secret = _load_alpaca_keys(user["id"])

    try:
        data = latest_quotes(syms, api_key, api_secret, feed=feed)
        return {
            "ok": True,
            "symbols": syms,
            "feed_used": data.get("feed") or feed,
            "data": data,
            "fetchedAt": _utc_iso(),
        }
    except HTTPException:
        raise
    except Exception as e:
        _http_exc(
            502,
            "ALPACA_QUOTES_FAILED",
            "Could not fetch latest quotes.",
            "Try again in a moment.",
            source="market_us.get_latest_quotes",
            debug=repr(e),
        )


@router.get("/trades")
def get_trades(
    symbol: str,
    request: Request,
    response: Response,
    limit: int = 50,
    feed: str = "sip",
):
    user = require_user_or_runner(request, response)

    sym = (symbol or "").upper().strip()
    if not sym:
        _http_exc(400, "SYMBOL_REQUIRED", "symbol is required.", "Provide a symbol like SPY.", source="market_us.get_trades")

    limit = max(1, min(int(limit), 2000))

    api_key, api_secret = _load_alpaca_keys(user["id"])

    try:
        data = recent_trades(sym, api_key, api_secret, limit=limit, feed=feed)
        return {
            "ok": True,
            "symbol": sym,
            "feed_used": data.get("feed") or feed,
            "data": data,
            "fetchedAt": _utc_iso(),
        }
    except HTTPException:
        raise
    except Exception as e:
        _http_exc(
            502,
            "ALPACA_TRADES_FAILED",
            "Could not fetch recent trades.",
            "Try again in a moment.",
            source="market_us.get_trades",
            debug=repr(e),
        )


@router.get("/bars")
def bars(
    request: Request,
    response: Response,
    symbol: str = Query(..., min_length=1),
    timeframe: str = Query("15Min"),
    limit: int = Query(100, ge=50, le=2000),
    feed: str = Query("sip"),
):
    """
    Browser OR runner supported.
    Runner sends:
      - X-Bot-Runner-Secret
      - X-Runner-User-Id
    Browser uses HttpOnly cookies.
    """
    user = require_user_or_runner(request, response)

    sym = symbol.upper().strip()
    tf = timeframe.strip()

    try:
        api_key, api_secret = _load_alpaca_keys(user["id"])
    except HTTPException as e:
        # Helpful UI hint
        _set_notice(
            response,
            "Alpaca not connected (or keys can’t be decrypted). Fix in Connected Apps.",
            level="error",
        )
        raise e

    # Fetch bars
    bars_obj = _alpaca_intraday_bars(sym, tf, limit, api_key, api_secret, feed=feed)

    return {
        "ok": True,
        "symbol": sym,
        "timeframe": tf,
        "provider_used": "alpaca",
        "bars": bars_obj,
        "notice": None,
        "fetchedAt": _utc_iso(),
    }
