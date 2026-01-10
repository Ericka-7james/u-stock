# backend/api/routes/market_us.py
from __future__ import annotations

import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

from api.deps import require_user_or_runner
from api.db import get_supabase_service
from api.crypto_utils import decrypt_secret
from api.clients.alpaca_client import latest_quotes, recent_trades

router = APIRouter(prefix="/api/market/us", tags=["market-us"])

ALPACA_DATA_BASE = os.getenv("ALPACA_DATA_BASE", "https://data.alpaca.markets").rstrip("/")
ALPACA_PAPER_TRADE_BASE = os.getenv("ALPACA_TRADE_BASE", "https://paper-api.alpaca.markets").rstrip("/")
ALPACA_LIVE_TRADE_BASE = os.getenv("ALPACA_LIVE_TRADE_BASE", "https://api.alpaca.markets").rstrip("/")


# -----------------------------
# Helpers
# -----------------------------
def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_notice(response: Response, message: str, level: str = "info") -> None:
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
    detail: Dict[str, Any] = {"code": code, "message": message, "source": source}
    if user_action:
        detail["user_action"] = user_action
    if debug:
        detail["debug"] = debug
    raise HTTPException(status_code=status_code, detail=detail)


def _iso_to_epoch_seconds(iso_str: Optional[str]) -> Optional[int]:
    if not iso_str:
        return None
    try:
        s = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        return int(dt.timestamp())
    except Exception:
        return None


def _load_alpaca_keys(user_id: str) -> Tuple[str, str, str]:
    """
    Returns (api_key, api_secret, mode) where mode is "paper" or "live".
    Reads from Supabase integrations table.
    """
    sb = get_supabase_service()
    try:
        res = (
            sb.table("integrations")
            .select("api_key_enc,api_secret_enc,status,mode")
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

    mode = str(row.get("mode") or ("paper" if os.getenv("ALPACA_PAPER", "true").lower() == "true" else "live")).lower()
    if mode not in ("paper", "live"):
        mode = "paper"

    return api_key, api_secret, mode


def _alpaca_trade_base(mode: str) -> str:
    return ALPACA_PAPER_TRADE_BASE if mode == "paper" else ALPACA_LIVE_TRADE_BASE


def _alpaca_intraday_bars(
    symbol: str,
    timeframe: str,
    limit: int,
    api_key: str,
    api_secret: str,
    feed: str = "sip",
) -> Dict[str, List[float]]:
    url = f"{ALPACA_DATA_BASE}/v2/stocks/{symbol}/bars"
    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "accept": "application/json",
    }
    params = {"timeframe": timeframe, "limit": limit, "adjustment": "raw", "feed": feed}

    # Keep this tight so the runner never hangs for long
    r = requests.get(url, headers=headers, params=params, timeout=8)

    if r.status_code in (401, 403):
        _http_exc(
            401,
            "ALPACA_KEYS_REJECTED",
            "Alpaca keys rejected.",
            "Reconnect Alpaca in Connected Apps and paste keys again.",
            source="market_us._alpaca_intraday_bars",
            debug=f"status={r.status_code} body={r.text[:200]}",
        )

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
    v = [float(b["v"]) for b in bars if isinstance(b, dict) and "v" in b]

    return {"o": o, "h": h, "l": l, "c": c, "v": v}


# -----------------------------
# Endpoints
# -----------------------------
@router.get("/session")
def market_session(request: Request, response: Response) -> Dict[str, Any]:
    """
    Single source of truth for whether US equities market is open.

    Uses Alpaca /v2/clock so the runner can sleep until next open.
    """
    user = require_user_or_runner(request, response)

    api_key, api_secret, mode = _load_alpaca_keys(user["id"])
    base = _alpaca_trade_base(mode)

    try:
        r = requests.get(
            f"{base}/v2/clock",
            headers={
                "APCA-API-KEY-ID": api_key,
                "APCA-API-SECRET-KEY": api_secret,
                "accept": "application/json",
            },
            timeout=6,
        )
    except Exception as e:
        _http_exc(
            502,
            "ALPACA_CLOCK_TIMEOUT",
            "Could not reach Alpaca clock endpoint.",
            "Try again in a moment.",
            source="market_us.market_session",
            debug=repr(e),
        )

    if r.status_code in (401, 403):
        _http_exc(
            401,
            "ALPACA_KEYS_REJECTED",
            "Alpaca keys rejected.",
            "Reconnect Alpaca in Connected Apps and paste keys again.",
            source="market_us.market_session",
            debug=f"status={r.status_code} body={r.text[:200]}",
        )

    if r.status_code != 200:
        _http_exc(
            502,
            "ALPACA_CLOCK_FAILED",
            "Failed to fetch market clock from Alpaca.",
            "Try again in a moment.",
            source="market_us.market_session",
            debug=f"status={r.status_code} body={r.text[:300]}",
        )

    data = r.json() or {}
    is_open = bool(data.get("is_open"))
    next_open = data.get("next_open")
    next_close = data.get("next_close")
    ts = data.get("timestamp")

    now_epoch = int(time.time())
    next_open_epoch = _iso_to_epoch_seconds(next_open)
    next_close_epoch = _iso_to_epoch_seconds(next_close)

    seconds_until_open = None
    if (not is_open) and next_open_epoch:
        seconds_until_open = max(0, next_open_epoch - now_epoch)

    seconds_until_close = None
    if is_open and next_close_epoch:
        seconds_until_close = max(0, next_close_epoch - now_epoch)

    return {
        "ok": True,
        "is_open": is_open,
        "timestamp": ts,
        "next_open": next_open,
        "next_close": next_close,
        "seconds_until_open": seconds_until_open,
        "seconds_until_close": seconds_until_close,
        "mode": mode,
        "fetchedAt": _utc_iso(),
    }


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
        _http_exc(
            400,
            "SYMBOLS_REQUIRED",
            "symbols is required.",
            "Provide one or more symbols.",
            source="market_us.get_latest_quotes",
        )

    api_key, api_secret, _mode = _load_alpaca_keys(user["id"])

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
    request: Request,
    response: Response,
    symbol: str,
    limit: int = 50,
    feed: str = "sip",
):
    user = require_user_or_runner(request, response)

    sym = (symbol or "").upper().strip()
    if not sym:
        _http_exc(
            400,
            "SYMBOL_REQUIRED",
            "symbol is required.",
            "Provide a symbol like SPY.",
            source="market_us.get_trades",
        )

    limit = max(1, min(int(limit), 2000))
    api_key, api_secret, _mode = _load_alpaca_keys(user["id"])

    try:
        data = recent_trades(sym, api_key, api_secret, limit=limit, feed=feed)
        return {"ok": True, "symbol": sym, "feed_used": data.get("feed") or feed, "data": data, "fetchedAt": _utc_iso()}
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
        api_key, api_secret, _mode = _load_alpaca_keys(user["id"])
    except HTTPException as e:
        _set_notice(response, "Alpaca not connected (or keys can’t be decrypted). Fix in Connected Apps.", level="error")
        raise e

    bars_obj = _alpaca_intraday_bars(sym, tf, int(limit), api_key, api_secret, feed=feed)

    return {
        "ok": True,
        "symbol": sym,
        "timeframe": tf,
        "provider_used": "alpaca",
        "feed_used": feed,
        "bars": bars_obj,
        "notice": None,
        "fetchedAt": _utc_iso(),
    }
