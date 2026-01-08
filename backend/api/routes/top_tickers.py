# api/routes/top_tickers.py
import os
import time
import requests
from typing import Dict, Any, Optional, List, Tuple

from fastapi import APIRouter, HTTPException, Query, Request, Response

router = APIRouter(prefix="/api/market/us", tags=["market-us"])

ALPACA_DATA_BASE = os.getenv("ALPACA_DATA_BASE", "https://data.alpaca.markets")
ALPACA_PAPER_TRADE_BASE = os.getenv("ALPACA_TRADE_BASE", "https://paper-api.alpaca.markets")
ALPACA_LIVE_TRADE_BASE = os.getenv("ALPACA_LIVE_TRADE_BASE", "https://api.alpaca.markets")

# best-effort in-memory cache (serverless instances may not share memory)
_CACHE: Dict[str, Dict[str, Any]] = {}
DEFAULT_TTL_SECONDS = 45  # 30–60 seconds target

def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    e = _CACHE.get(key)
    if not e:
        return None
    if time.time() > e["expires_at"]:
        _CACHE.pop(key, None)
        return None
    return e["value"]

def _cache_set(key: str, value: Dict[str, Any], ttl: int) -> None:
    _CACHE[key] = {"value": value, "expires_at": time.time() + ttl}

def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {"APCA-API-KEY-ID": api_key, "APCA-API-SECRET-KEY": api_secret}

def _normalize(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "symbol": row.get("symbol") or row.get("ticker"),
        "name": row.get("name"),  # often None from screener
        "price": row.get("price") or row.get("last_price"),
        "changePct": row.get("change_percent") or row.get("change_pct") or row.get("percent_change"),
        "volume": row.get("volume") or row.get("trade_count"),
    }

def _fetch_most_actives(api_key: str, api_secret: str, limit: int) -> List[Dict[str, Any]]:
    url = f"{ALPACA_DATA_BASE}/v1beta1/screener/stocks/most-actives"
    r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), timeout=10)
    if r.status_code >= 400:
        raise HTTPException(502, detail=f"Alpaca most-actives error: {r.status_code} {r.text[:180]}")
    data = r.json()
    items = data if isinstance(data, list) else data.get("most_actives") or data.get("symbols") or []
    return items[:limit]

def _fetch_top_gainers(api_key: str, api_secret: str, limit: int) -> List[Dict[str, Any]]:
    url = f"{ALPACA_DATA_BASE}/v1beta1/screener/stocks/movers"
    r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), timeout=10)
    if r.status_code >= 400:
        raise HTTPException(502, detail=f"Alpaca movers error: {r.status_code} {r.text[:180]}")
    data = r.json()
    gainers = data.get("gainers") or data.get("movers", {}).get("gainers") or []
    return gainers[:limit]

def _get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Returns (user_id, api_key, api_secret, mode) for the signed-in user.
    IMPORTANT: local-import index helpers to avoid circular imports.
    """
    from api.index import require_user, get_supabase_service, decrypt_secret  # local import to avoid circular

    u = require_user(request, response)
    user_id = u["id"]

    sb = get_supabase_service()
    try:
        rec = (
            sb.table("integrations")
            .select("status, api_key_enc, api_secret_enc, mode")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .maybe_single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load Alpaca integration: {repr(e)}")

    row = rec.data
    if not row or str(row.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not connected. Go to Connected Apps and connect Alpaca.")

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca keys missing. Please reconnect Alpaca.")

    if mode not in ("paper", "live"):
        mode = "paper"

    return user_id, api_key, api_secret, mode


@router.get("/top-tickers")
def top_tickers(
    request: Request,
    response: Response,
    list: str = Query("most_active", pattern="^(most_active|top_gainers)$"),
    limit: int = Query(10, ge=1, le=50),
    cache_ttl: int = Query(DEFAULT_TTL_SECONDS, ge=10, le=300),
):
    user_id, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    cache_key = f"{user_id}:top:{mode}:{list}:{limit}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    raw = _fetch_most_actives(api_key, api_secret, limit) if list == "most_active" else _fetch_top_gainers(api_key, api_secret, limit)
    items = [_normalize(r) for r in raw]

    out = {
        "asOf": int(time.time()),
        "list": list,
        "mode": mode,
        "source": "alpaca_screener_user_keys",
        "items": items,
        "cacheTtlSeconds": cache_ttl,
    }
    _cache_set(cache_key, out, ttl=cache_ttl)
    return out


@router.get("/clock")
def market_clock(
    request: Request,
    response: Response,
    cache_ttl: int = Query(30, ge=5, le=300),
):
    """
    GET /api/market/us/clock
    Uses the user's Alpaca mode to hit the correct trading base (paper vs live).
    Caches briefly to avoid hammering.
    """
    user_id, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    cache_key = f"{user_id}:clock:{mode}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    base = ALPACA_PAPER_TRADE_BASE if mode == "paper" else ALPACA_LIVE_TRADE_BASE
    url = f"{base}/v2/clock"

    r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), timeout=10)
    if r.status_code >= 400:
        raise HTTPException(502, detail=f"Alpaca clock error: {r.status_code} {r.text[:180]}")

    data = r.json()
    out = {"mode": mode, "source": "alpaca_clock_user_keys", **data, "cacheTtlSeconds": cache_ttl}
    _cache_set(cache_key, out, ttl=cache_ttl)
    return out
