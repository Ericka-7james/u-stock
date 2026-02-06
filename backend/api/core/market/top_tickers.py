from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response

from api.core.integrations.alpaca_creds import get_user_alpaca_creds
from api.core.market.top_tickers_service import get_top_tickers

router = APIRouter(prefix="/api/market/us", tags=["market-us"])


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

    # FastAPI's Query(pattern=...) already validates, but keep the type stable:
    src = "most_active" if source == "most_active" else "top_gainers"

    return get_top_tickers(
        user_id=user_id,
        api_key=api_key,
        api_secret=api_secret,
        mode=mode,
        source=src,  # type: ignore[arg-type]
        limit=int(limit),
        cache_ttl=int(cache_ttl),
        cache_bust=int(cache_bust),
    )
