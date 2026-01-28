# backend/api/routes/top_tickers.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Tuple, Optional

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

from api.core.integrations.alpaca_creds import get_user_alpaca_creds

router = APIRouter(prefix="/api/market/us", tags=["market-us"])

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip().rstrip("/")
REQUEST_TIMEOUT_SECONDS = int(os.getenv("ALPACA_HTTP_TIMEOUT", "12"))

# best-effort in-memory cache (per process)
_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_VERSION = "v2-top-tickers-userkey-netguard-cache"


def _now_epoch() -> int:
    return int(time.time())


def _cache_get(key: str):
    e = _CACHE.get(key)
    if not e:
        return None
    if time.time() > e["expires_at"]:
        _CACHE.pop(key, None)
        return None
    return e["value"]


def _cache_set(key: str, value: Any, ttl: int):
    _CACHE[key] = {"value": value, "expires_at": time.time() + ttl}


def _get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Returns: (user_id, api_key, api_secret, mode)
    Reads per-user stored Alpaca integration from Supabase 'integrations' table.
    """
    user = require_user(request, response)
    user_id = user["id"]

    sb = get_supabase_service()
    try:
        res = (
            sb.table("integrations")
            .select("api_key_enc,api_secret_enc,mode,status")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load integrations: {repr(e)}")

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

    return user_id, api_key, api_secret, mode


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
    }


def _safe_get(url: str, headers: Dict[str, str], params: Dict[str, Any]) -> requests.Response:
    try:
        return requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"alpaca_network_error: {repr(e)}")


def _safe_num(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _norm_pct(raw: Any) -> float:
    """
    Normalize percent-change into "percent points".
    - 0.0123 => 1.23
    - 1.23   => 1.23
    - 123    => 1.23 (scaled/bps-ish)
    """
    v = _safe_num(raw, 0.0)
    av = abs(v)
    if 0 < av <= 1.0:
        return v * 100.0
    if av > 200.0:
        return v / 100.0
    return v


def _normalize(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Alpaca screener rows into a consistent shape.
    We primarily need symbol + percent change for scoring.
    """
    sym = str(row.get("symbol") or row.get("S") or row.get("ticker") or "").upper().strip()

    change_raw = (
        row.get("percent_change")
        or row.get("change_pct")
        or row.get("changePct")
        or row.get("pct_change")
        or row.get("pc")
        or 0
    )

    change_pct = _norm_pct(change_raw)

    return {"symbol": sym, "changePct": change_pct, "raw": row}


def _fetch_top_gainers(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Alpaca endpoint:
      GET /v1beta1/screener/stocks/gainers?limit=N
    """
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/gainers"
    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params={"limit": int(limit)})

    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail=f"alpaca_top_gainers_auth_error {r.status_code}: {r.text}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"alpaca_top_gainers_error {r.status_code}: {r.text}")

    data = r.json() or {}
    if isinstance(data, list):
        return data
    return data.get("gainers") or data.get("data") or []


def _fetch_most_actives(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Alpaca endpoint:
      GET /v1beta1/screener/stocks/most-actives?limit=N
    """
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/most-actives"
    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params={"limit": int(limit)})

    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail=f"alpaca_most_active_auth_error {r.status_code}: {r.text}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"alpaca_most_active_error {r.status_code}: {r.text}")

    data = r.json() or {}
    if isinstance(data, list):
        return data
    return data.get("most_actives") or data.get("data") or []


@router.get("/top-tickers")
def top_tickers(
    request: Request,
    response: Response,
    source: str = Query("top_gainers", pattern="^(most_active|top_gainers)$"),
    limit: int = Query(12, ge=1, le=50),
    cache_ttl: int = Query(20, ge=5, le=120),
    cache_bust: int = Query(0, ge=0, le=1),
):
    """
    Debug endpoint:
      GET /api/market/us/top-tickers?source=top_gainers&limit=12
    """
    user_id, api_key, api_secret, mode = get_user_alpaca_creds(request, response)

    cache_key = f"{_CACHE_VERSION}:{user_id}:{source}:{limit}:{cache_ttl}:{cache_bust}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    pull_n = max(limit * 2, limit)
    raw = _fetch_most_actives(api_key, api_secret, pull_n) if source == "most_active" else _fetch_top_gainers(api_key, api_secret, pull_n)

    items: List[Dict[str, Any]] = []
    for r in (raw or []):
        if not isinstance(r, dict):
            continue
        norm = _normalize(r)
        if not norm["symbol"]:
            continue
        items.append(norm)

    out = {
        "ok": True,
        "mode": mode,
        "source": f"alpaca_{source}",
        "count": len(items),
        "items": items[:limit],
        "asOf": _now_epoch(),
        "meta": {"cache_ttl": cache_ttl},
    }
    _cache_set(cache_key, out, ttl=cache_ttl)
    return out
