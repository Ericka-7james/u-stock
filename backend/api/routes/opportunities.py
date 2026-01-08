# api/routes/opportunities.py
import time
from typing import Any, Dict

from fastapi import APIRouter, Query, Request, Response, HTTPException

router = APIRouter(prefix="/api/opportunities", tags=["opportunities"])

# best-effort in-memory cache (per user)
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


def _to_num(x) -> float:
    try:
        return float(x)
    except Exception:
        return 0.0


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

    # local import avoids circular import (index.py imports this router)
    from api.index import require_user

    u = require_user(request, response)
    user_id = u["id"]

    # include cache_ttl in key so changing ttl doesn't serve old cache unexpectedly
    cache_key = f"{user_id}:{market}:{source}:{limit}:{cache_ttl}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    # default empty shape for unsupported markets (v0)
    if market != "stocks":
        out = {
            "crypto": [],
            "stocks": [],
            "funds": [],
            "asOf": int(time.time()),
            "mode": "—",
            "source": "—",
            "cacheTtlSeconds": cache_ttl,
        }
        _cache_set(cache_key, out, ttl=cache_ttl)
        return out

    # Reuse your top_tickers router internals (fast + no extra HTTP hop)
    try:
        from api.routes.top_tickers import (
            _get_user_alpaca_creds,
            _fetch_most_actives,
            _fetch_top_gainers,
            _normalize,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Top tickers module not available: {repr(e)}")

    # this function should raise a useful 401/400 if alpaca is not connected
    try:
        _, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read Alpaca credentials: {repr(e)}")

    # pull more than needed, then rank down to limit
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
            # skip bad rows
            continue

    # Score v0: abs(day % change). If missing, score=0.
    ranked = []
    for it in items:
        sym = it.get("symbol")
        if not sym:
            continue
        chg = _to_num(it.get("changePct"))
        score = abs(chg)
        ranked.append({"symbol": sym, "score": score})

    ranked.sort(key=lambda r: r["score"], reverse=True)
    ranked = ranked[:limit]

    out = {
        "crypto": [],
        "stocks": ranked,
        "funds": [],
        "asOf": int(time.time()),
        "mode": mode,
        "source": f"alpaca_{source}",
        "cacheTtlSeconds": cache_ttl,
    }

    _cache_set(cache_key, out, ttl=cache_ttl)
    return out
