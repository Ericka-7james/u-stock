# backend/api/routes/market_us.py
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Tuple

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

from api.core.security import require_user, decrypt_secret, get_supabase_service

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except Exception:
    ZoneInfo = None  # type: ignore
    ZoneInfoNotFoundError = Exception  # type: ignore


router = APIRouter(prefix="/api/market", tags=["market"])

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip().rstrip("/")
REQUEST_TIMEOUT_SECONDS = int(os.getenv("ALPACA_HTTP_TIMEOUT", "12"))

# Optional lightweight cache (per-process). For multi-instance scaling, use Redis.
_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = int(os.getenv("MARKET_LEADERS_TTL_SECONDS", "15"))
_CACHE_VERSION = "v1-market_us-leaders-userkey"

_SESSION = requests.Session()

# --------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------
def _now_epoch() -> int:
    return int(time.time())


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time.time() > entry["expires_at"]:
        _CACHE.pop(key, None)
        return None
    return entry["value"]


def _cache_set(key: str, value: Any, ttl: int):
    _CACHE[key] = {"value": value, "expires_at": time.time() + ttl}


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
    }


def _safe_get(url: str, headers: Dict[str, str]) -> requests.Response:
    try:
        return _SESSION.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "ALPACA_NETWORK_ERROR",
                "message": "Network error calling Alpaca data API",
                "provider": "alpaca",
                "error": repr(e),
            },
        )


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
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_NOT_CONNECTED", "message": "Alpaca not connected for this user"},
        )

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_NOT_CONNECTED", "message": "Alpaca is not marked connected"},
        )

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_INVALID_KEY", "message": "Alpaca keys missing or unreadable"},
        )

    return api_key, api_secret, mode


def _safe_num(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _norm_pct(raw: Any) -> float:
    """
    Normalize percent-change into "percent points".
    Handles common shapes:
      - 0.0123 => 1.23%
      - 1.23   => 1.23%
      - 123    => 1.23% (bps-ish / scaled)
    """
    v = _safe_num(raw, 0.0)
    av = abs(v)

    if 0 < av <= 1.0:
        return v * 100.0
    if av > 200.0:
        return v / 100.0
    return v


def _pick_symbol(it: Dict[str, Any]) -> str:
    sym = it.get("symbol") or it.get("ticker") or it.get("S") or it.get("t") or ""
    return str(sym).upper().strip()


def _pick_change_pct(it: Dict[str, Any]) -> float:
    raw = (
        it.get("change_pct")
        or it.get("changePct")
        or it.get("change_percent")
        or it.get("percent_change")
        or it.get("pct_change")
        or it.get("pc")
        or 0.0
    )
    return _norm_pct(raw)


def _pick_last(it: Dict[str, Any]) -> float:
    return _safe_num(it.get("last") or it.get("last_price") or it.get("price") or it.get("c") or 0.0)


def _pick_prev_close(it: Dict[str, Any]) -> float:
    return _safe_num(it.get("prev_close") or it.get("prevClose") or it.get("previous_close") or it.get("pc") or 0.0)


def _unwrap_payload(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    base = payload
    if isinstance(base.get("data"), dict):
        base = base["data"]

    if isinstance(base.get("movers"), dict):
        base = base["movers"]

    return base if isinstance(base, dict) else {}


# --------------------------------------------------------------------
# ✅ market session endpoint used by bots + UI
# --------------------------------------------------------------------
# IMPORTANT:
# - This endpoint must be FAST and must NOT touch Supabase/Alpaca/etc.
# - If zoneinfo isn't available, fallback should still behave like ET
#   (not UTC pretending to be ET).
_ET_FALLBACK = timezone(timedelta(hours=-5))  # EST-style fallback


def _et_now() -> datetime:
    if ZoneInfo is not None:
        try:
            return datetime.now(ZoneInfo("America/New_York"))
        except ZoneInfoNotFoundError:
            # Windows / slim env may not have tz database available
            pass
        except Exception:
            # never let timezone resolution break the endpoint
            pass
    # fallback: approximate ET instead of UTC
    return datetime.now(_ET_FALLBACK)


def _next_weekday(d: datetime) -> datetime:
    # Monday=0 .. Sunday=6
    out = d
    while out.weekday() >= 5:
        out = out + timedelta(days=1)
    return out


def _session_dict() -> Dict[str, Any]:
    """
    Minimal session logic:
    - Stocks open Mon-Fri
    - Regular session 9:30am–4:00pm ET
    - (Holidays/half-days can be added later via a calendar provider)
    """
    now = _et_now()

    # Weekend
    if now.weekday() >= 5:
        nxt = _next_weekday(now.replace(hour=9, minute=30, second=0, microsecond=0))
        return {
            "ok": True,
            "market": "us_stocks",
            "is_open": False,
            "reason": "Weekend",
            "now_et": now.isoformat(),
            "next_open": int(nxt.timestamp()),
            "asOf": _now_epoch(),
        }

    open_dt = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_dt = now.replace(hour=16, minute=0, second=0, microsecond=0)

    if now < open_dt:
        return {
            "ok": True,
            "market": "us_stocks",
            "is_open": False,
            "reason": "Pre-market",
            "now_et": now.isoformat(),
            "next_open": int(open_dt.timestamp()),
            "asOf": _now_epoch(),
        }

    if now >= close_dt:
        nxt_day = _next_weekday((now + timedelta(days=1)).replace(hour=9, minute=30, second=0, microsecond=0))
        return {
            "ok": True,
            "market": "us_stocks",
            "is_open": False,
            "reason": "After-hours",
            "now_et": now.isoformat(),
            "next_open": int(nxt_day.timestamp()),
            "asOf": _now_epoch(),
        }

    return {
        "ok": True,
        "market": "us_stocks",
        "is_open": True,
        "reason": "Regular session",
        "now_et": now.isoformat(),
        "next_open": None,
        "asOf": _now_epoch(),
    }


@router.get("/us/session")
def market_us_session():
    # ultra-defensive: this endpoint should never hang
    try:
        return _session_dict()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "MARKET_SESSION_FAILED", "message": "Server error", "error": repr(e)},
        )


# --------------------------------------------------------------------
# market leaders (unchanged behavior)
# --------------------------------------------------------------------
@router.get("/leaders")
def market_leaders(
    request: Request,
    response: Response,
    market: str = Query("stocks", pattern="^(stocks|crypto)$"),
    direction: str = Query("up", pattern="^(up|down|both)$"),
    limit: int = Query(8, ge=1, le=50),
    cache_bust: int = Query(0, ge=0, le=1),
):
    """
    GET /api/market/leaders?market=stocks&direction=up&limit=8
    """
    try:
        user = require_user(request, response)
        user_id = user["id"]

        cache_key = f"{_CACHE_VERSION}:{user_id}:{market}:{direction}:{limit}"
        if not cache_bust:
            cached = _cache_get(cache_key)
            if cached is not None:
                return cached

        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user_id)

        url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/{market}/movers"
        r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret))

        if r.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "ALPACA_INVALID_KEY",
                    "message": "Alpaca rejected your API keys or you don’t have access.",
                    "hint": "Reconnect Alpaca in Connected Apps and paste keys again.",
                    "provider": "alpaca",
                },
            )

        if r.status_code == 404:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "SOURCE_NOT_FOUND",
                    "message": f"Alpaca movers endpoint returned 404 at {url}",
                    "provider": "alpaca",
                },
            )

        if r.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "ALPACA_SOURCE_ERROR",
                    "message": f"Alpaca movers error {r.status_code}: {r.text}",
                    "provider": "alpaca",
                },
            )

        payload = r.json() or {}
        base = _unwrap_payload(payload)

        gainers = base.get("gainers") or []
        losers = base.get("losers") or []

        def normalize_rows(rows: List[Dict[str, Any]], dir_label: str) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            for it in rows or []:
                if not isinstance(it, dict):
                    continue
                sym = _pick_symbol(it)
                if not sym:
                    continue
                out.append(
                    {
                        "symbol": sym,
                        "changePct": _pick_change_pct(it),
                        "last": _pick_last(it),
                        "prevClose": _pick_prev_close(it),
                        "direction": dir_label,
                    }
                )
            return out

        up_items = normalize_rows(gainers, "up")
        down_items = normalize_rows(losers, "down")

        if direction == "up":
            items = up_items[:limit]
        elif direction == "down":
            items = down_items[:limit]
        else:
            items = (up_items + down_items)[:limit]

        out = {
            "ok": True,
            "source": "ALPACA",
            "market": market,
            "direction": direction,
            "mode": mode,
            "items": items,
            "asOf": _now_epoch(),
            "meta": {
                "cache_ttl": CACHE_TTL_SECONDS,
                "provider": "alpaca",
            },
        }

        _cache_set(cache_key, out, CACHE_TTL_SECONDS)
        return out

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "MARKET_LEADERS_FAILED", "message": "Server error", "error": repr(e)},
        )
