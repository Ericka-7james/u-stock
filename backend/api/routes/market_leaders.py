# backend/api/routes/market_leaders.py
from __future__ import annotations

import threading
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Request, Response

from api.core.integrations.alpaca_creds import get_user_alpaca_creds, get_user_alpaca_creds_by_user_id
from api.core.market.market_leaders_service import market_leaders as market_leaders_service
from api.security.bot_runner_dep import require_bot_runner

router = APIRouter(prefix="/api/market", tags=["market"])

# --------------------------------------------------------------------
# ✅ cache (tests expect this module-level name)
# --------------------------------------------------------------------
_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_VERSION = "v3-market-leaders-ui-and-runner"


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


# --------------------------------------------------------------------
# UI endpoint (cookie auth)
# --------------------------------------------------------------------
@router.get("/leaders")
def market_leaders(
    request: Request,
    response: Response,
    market: str = Query("stocks", pattern="^(stocks)$"),
    direction: str = Query("up", pattern="^(up|down)$"),
    show_more: int = Query(0, ge=0, le=1, description="0=default (7), 1=show more (15)"),
    limit: Optional[int] = Query(None, ge=1, le=25, description="Optional explicit limit override"),
    cache_ttl: int = Query(20, ge=5, le=120),
    fetch_multiplier: int = Query(15, ge=2, le=30),
    cache_bust: int = Query(0, ge=0, le=1),
):
    user_id, api_key, api_secret, mode = get_user_alpaca_creds(request, response)

    eff_limit = int(limit) if limit is not None else (15 if int(show_more) == 1 else 7)
    eff_limit = max(1, min(25, int(eff_limit)))

    cache_key = f"{_CACHE_VERSION}:ui:{user_id}:{market}:{direction}:{eff_limit}:{cache_ttl}:{fetch_multiplier}:{cache_bust}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    out = market_leaders_service(
        user_id=user_id,
        api_key=api_key,
        api_secret=api_secret,
        mode=mode,
        market=market,
        direction=direction,
        limit=eff_limit,
        cache_ttl=int(cache_ttl),
        fetch_multiplier=int(fetch_multiplier),
        cache_bust=int(cache_bust),
    )

    meta = dict((out or {}).get("meta") or {})
    meta.update(
        {
            "ui_default": 7,
            "ui_show_more": 15,
            "effective_limit": eff_limit,
        }
    )
    out["meta"] = meta

    _cache_set(cache_key, out, ttl=int(cache_ttl))
    return out


# --------------------------------------------------------------------
# ✅ Runner endpoint (Bearer runner token) - no cookies
# --------------------------------------------------------------------
@router.get("/leaders/runner")
def market_leaders_runner(
    runner_user_id: str = Depends(require_bot_runner),
    market: str = Query("stocks", pattern="^(stocks)$"),
    direction: str = Query("up", pattern="^(up|down)$"),
    show_more: int = Query(0, ge=0, le=1),
    limit: Optional[int] = Query(None, ge=1, le=25),
    cache_ttl: int = Query(20, ge=5, le=300),
    fetch_multiplier: int = Query(15, ge=2, le=30),
    cache_bust: int = Query(0, ge=0, le=1),
):
    """
    Runner/bots call (no cookies):
      GET /api/market/leaders/runner?direction=up&show_more=1

    Requires:
      Authorization: Bearer <runner_token>
    """
    eff_limit = int(limit) if limit is not None else (15 if int(show_more) == 1 else 7)
    eff_limit = max(1, min(25, int(eff_limit)))

    cache_key = f"{_CACHE_VERSION}:runner:{runner_user_id}:{market}:{direction}:{eff_limit}:{cache_ttl}:{fetch_multiplier}:{cache_bust}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    api_key, api_secret, mode = get_user_alpaca_creds_by_user_id(runner_user_id)

    out = market_leaders_service(
        user_id=runner_user_id,
        api_key=api_key,
        api_secret=api_secret,
        mode=mode,
        market=market,
        direction=direction,
        limit=eff_limit,
        cache_ttl=int(cache_ttl),
        fetch_multiplier=int(fetch_multiplier),
        cache_bust=int(cache_bust),
    )

    meta = dict((out or {}).get("meta") or {})
    meta.update(
        {
            "ui_default": 7,
            "ui_show_more": 15,
            "effective_limit": eff_limit,
            "auth": "runner_token",
        }
    )
    out["meta"] = meta

    _cache_set(cache_key, out, ttl=int(cache_ttl))
    return out
