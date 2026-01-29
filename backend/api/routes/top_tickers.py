# backend/api/routes/top_tickers.py
from __future__ import annotations

import os
import time
import threading
from typing import Any, Dict, List, Tuple, Optional

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

from api.deps import require_user
from api.db import get_supabase_service
from api.core.crypto import decrypt_secret  # IMPORTANT: tests monkeypatch this symbol

router = APIRouter(prefix="/api/market/us", tags=["market-us"])

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip().rstrip("/")
REQUEST_TIMEOUT_SECONDS = float(os.getenv("ALPACA_HTTP_TIMEOUT", "12"))

# best-effort in-memory cache (per process)
_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_VERSION = "v3-top-tickers-userkey-netguard-cache"

_SESSION = requests.Session()
try:
    from urllib3.util.retry import Retry
    from requests.adapters import HTTPAdapter

    retry = Retry(
        total=3,
        connect=2,
        read=2,
        backoff_factor=0.4,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=50)
    _SESSION.mount("https://", adapter)
    _SESSION.mount("http://", adapter)
except Exception:
    pass


def _now_epoch() -> int:
    return int(time.time())


def _cache_get(key: str) -> Optional[Any]:
    with _CACHE_LOCK:
        e = _CACHE.get(key)
        if not e:
            return None
        if time.time() > float(e.get("expires_at", 0)):
            _CACHE.pop(key, None)
            return None
        return e.get("value")


def _cache_set(key: str, value: Any, ttl: int) -> None:
    with _CACHE_LOCK:
        _CACHE[key] = {"value": value, "expires_at": time.time() + float(ttl)}


def _raise_err(status_code: int, code: str, message: str, extra: Optional[Dict[str, Any]] = None) -> None:
    detail: Dict[str, Any] = {"code": code, "message": message, "provider": "alpaca"}
    if extra:
        detail.update(extra)
    raise HTTPException(status_code=status_code, detail=detail)


def _get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Returns: (user_id, api_key, api_secret, mode)

    NOTE: Tests monkeypatch require_user/get_supabase_service/decrypt_secret at THIS MODULE,
    so we must call these module-level symbols (not a shared helper in another module).
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
        raise HTTPException(
            status_code=500,
            detail={"code": "INTEGRATIONS_LOAD_FAILED", "message": "Failed to load integrations", "error": repr(e)},
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

    return user_id, api_key, api_secret, mode


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
        "User-Agent": "u-stock/1.0 (+top tickers)",
    }


def _safe_get(url: str, headers: Dict[str, str], params: Dict[str, Any]) -> requests.Response:
    try:
        return _SESSION.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.Timeout as e:
        _raise_err(504, "ALPACA_TIMEOUT", "Timed out calling Alpaca data API", {"error": repr(e)})
    except requests.RequestException as e:
        _raise_err(502, "ALPACA_NETWORK_ERROR", "Network error calling Alpaca data API", {"error": repr(e)})
    raise HTTPException(status_code=502, detail={"code": "ALPACA_NETWORK_ERROR", "message": "Unknown network error"})


def _safe_num(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _norm_pct(raw: Any) -> float:
    v = _safe_num(raw, 0.0)
    av = abs(v)
    if 0 < av <= 1.0:
        return v * 100.0
    if av > 200.0:
        return v / 100.0
    return v


def _normalize(row: Dict[str, Any]) -> Dict[str, Any]:
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


def _read_json(resp: requests.Response) -> Any:
    try:
        return resp.json()
    except Exception:
        return None


def _fetch_top_gainers(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/gainers"
    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params={"limit": int(limit)})

    if r.status_code in (401, 403):
        _raise_err(401, "ALPACA_INVALID_KEY", "Alpaca rejected your API keys or you don’t have access.", {"upstream_status": r.status_code})
    if r.status_code == 429:
        _raise_err(502, "ALPACA_RATE_LIMITED", "Alpaca rate-limited the request.", {"upstream_status": 429})
    if r.status_code >= 400:
        _raise_err(502, "ALPACA_SOURCE_ERROR", "Alpaca top gainers request failed.", {"upstream_status": r.status_code, "body": (r.text or "")[:1000]})

    data = _read_json(r) or {}
    if isinstance(data, list):
        return data
    return data.get("gainers") or data.get("data") or []


def _fetch_most_actives(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/most-actives"
    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params={"limit": int(limit)})

    if r.status_code in (401, 403):
        _raise_err(401, "ALPACA_INVALID_KEY", "Alpaca rejected your API keys or you don’t have access.", {"upstream_status": r.status_code})
    if r.status_code == 429:
        _raise_err(502, "ALPACA_RATE_LIMITED", "Alpaca rate-limited the request.", {"upstream_status": 429})
    if r.status_code >= 400:
        _raise_err(502, "ALPACA_SOURCE_ERROR", "Alpaca most actives request failed.", {"upstream_status": r.status_code, "body": (r.text or "")[:1000]})

    data = _read_json(r) or {}
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
    user_id, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    cache_key = f"{_CACHE_VERSION}:{user_id}:{source}:{limit}:{cache_ttl}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached is not None:
            response.headers["X-Cache"] = "HIT"
            response.headers["Cache-Control"] = f"private, max-age={cache_ttl}"
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
        "meta": {"cache_ttl": cache_ttl, "provider": "alpaca"},
    }

    _cache_set(cache_key, out, ttl=cache_ttl)
    response.headers["X-Cache"] = "MISS"
    response.headers["Cache-Control"] = f"private, max-age={cache_ttl}"
    return out
