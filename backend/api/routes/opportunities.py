# backend/api/routes/opportunities.py
from __future__ import annotations

import time
from typing import Any, Dict, List

from fastapi import APIRouter, Query, Request, Response, HTTPException

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])

# best-effort in-memory cache (per process)
_CACHE: Dict[str, Dict[str, Any]] = {}


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


def _now_epoch() -> int:
    return int(time.time())


def _to_num(x) -> float:
    try:
        return float(x)
    except Exception:
        return 0.0


# ---------------------------------------------------------
# ✅ Runner-friendly endpoint (NO AUTH)
# Runner calls: GET http://127.0.0.1:8000/api/opportunities
# ---------------------------------------------------------
@router.get("")
@router.get("/")
def opportunities_for_runner(
    limit: int = Query(12, ge=1, le=50),
    cache_ttl: int = Query(30, ge=10, le=300),
):
    """
    Runner expects:
      { ok: true, symbols: ["SPY","QQQ",...], generatedAt: epochSeconds }

    For local dev we keep this public so the runner can run without cookies.
    Later, if you want to lock it down again, we can require BOT_RUNNER_SECRET.
    """
    cache_key = f"runner:{limit}:{cache_ttl}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    universe = [
        "SPY", "QQQ", "IWM",
        "AAPL", "MSFT", "NVDA",
        "AMZN", "TSLA", "META",
        "AMD", "GOOGL", "NFLX",
    ]

    out = {"ok": True, "symbols": universe[:limit], "generatedAt": _now_epoch()}
    _cache_set(cache_key, out, ttl=cache_ttl)
    return out


# ---------------------------------------------------------
# ✅ Existing endpoint you wanted to KEEP: /opportunities/top
# Requires auth + Alpaca (because it uses your top_tickers helpers)
# ---------------------------------------------------------
@router.get("/top")
def top_opportunities(
    request: Request,
    response: Response,
    market: str = Query("stocks", pattern="^(stocks|crypto|funds)$"),
    source: str = Query("top_gainers", pattern="^(most_active|top_gainers)$"),
    limit: int = Query(6, ge=1, le=20),
    cache_ttl: int = Query(45, ge=10, le=300),
):
    """
    Returns:
    {
      crypto: [],
      stocks: [{symbol, score}],
      funds: [],
      asOf: epochSeconds,
      mode: "paper" | "live",
      source: "alpaca_top_gainers" | "alpaca_most_active",
      cacheTtlSeconds: number
    }
    """
    from api.deps import require_user

    u = require_user(request, response)
    user_id = u["id"]

    cache_key = f"{user_id}:{market}:{source}:{limit}:{cache_ttl}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    if market != "stocks":
        out = {
            "crypto": [],
            "stocks": [],
            "funds": [],
            "asOf": _now_epoch(),
            "mode": "—",
            "source": "—",
            "cacheTtlSeconds": cache_ttl,
        }
        _cache_set(cache_key, out, ttl=cache_ttl)
        return out

    try:
        from api.routes.top_tickers import (
            _get_user_alpaca_creds,
            _fetch_most_actives,
            _fetch_top_gainers,
            _normalize,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Top tickers module not available: {repr(e)}")

    try:
        _, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read Alpaca credentials: {repr(e)}")

    pull_n = max(limit * 2, limit)

    try:
        raw = (
            _fetch_most_actives(api_key, api_secret, pull_n)
            if source == "most_active"
            else _fetch_top_gainers(api_key, api_secret, pull_n)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Alpaca fetch failed: {repr(e)}")

    items = []
    for r in (raw or []):
        try:
            items.append(_normalize(r))
        except Exception:
            continue

    ranked = []
    for it in items:
        sym = it.get("symbol")
        if not sym:
            continue
        chg = _to_num(it.get("changePct"))
        ranked.append({"symbol": sym, "score": abs(chg)})

    ranked.sort(key=lambda r: r["score"], reverse=True)
    ranked = ranked[:limit]

    out = {
        "crypto": [],
        "stocks": ranked,
        "funds": [],
        "asOf": _now_epoch(),
        "mode": mode,
        "source": f"alpaca_{source}",
        "cacheTtlSeconds": cache_ttl,
    }

    _cache_set(cache_key, out, ttl=cache_ttl)
    return out
