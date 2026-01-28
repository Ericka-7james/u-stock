from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response

from api.core.integrations.alpaca_creds import get_user_alpaca_creds
from api.core.market.market_leaders_service import market_leaders as market_leaders_service

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/leaders")
def market_leaders(
    request: Request,
    response: Response,
    market: str = Query("stocks", pattern="^(stocks)$"),
    direction: str = Query("up", pattern="^(up|down)$"),
    limit: int = Query(10, ge=1, le=25),
    cache_ttl: int = Query(20, ge=5, le=120),
    fetch_multiplier: int = Query(15, ge=2, le=30),
    cache_bust: int = Query(0, ge=0, le=1),
):
    user_id, api_key, api_secret, mode = get_user_alpaca_creds(request, response)

    return market_leaders_service(
        user_id=user_id,
        api_key=api_key,
        api_secret=api_secret,
        mode=mode,
        market=market,
        direction=direction,
        limit=int(limit),
        cache_ttl=int(cache_ttl),
        fetch_multiplier=int(fetch_multiplier),
        cache_bust=int(cache_bust),
    )
