from __future__ import annotations

import time
from typing import Any, Dict, List, Literal

from api.core.cache.ttl import TTLCache
from api.core.market.alpaca_screener_client import (
    fetch_most_actives,
    fetch_top_gainers,
    normalize_screener_row,
)

TopTickersSource = Literal["most_active", "top_gainers"]

_CACHE = TTLCache()
_CACHE_VERSION = "v3-top-tickers-userkey-netguard-ttlcache"


def _now_epoch() -> int:
    return int(time.time())


def get_top_tickers(
    *,
    user_id: str,
    api_key: str,
    api_secret: str,
    mode: str,
    source: TopTickersSource,
    limit: int,
    cache_ttl: int,
    cache_bust: int,
) -> Dict[str, Any]:
    cache_key = f"{_CACHE_VERSION}:{user_id}:{source}:{limit}:{cache_ttl}:{cache_bust}"
    if not cache_bust:
        cached = _CACHE.get(cache_key)
        if cached:
            return cached

    pull_n = max(int(limit) * 2, int(limit))

    raw = (
        fetch_most_actives(api_key, api_secret, pull_n)
        if source == "most_active"
        else fetch_top_gainers(api_key, api_secret, pull_n)
    )

    items: List[Dict[str, Any]] = []
    for r in (raw or []):
        if not isinstance(r, dict):
            continue
        norm = normalize_screener_row(r)
        if not norm["symbol"]:
            continue
        items.append(norm)

    out = {
        "ok": True,
        "mode": mode,
        "source": f"alpaca_{source}",
        "count": len(items),
        "items": items[: int(limit)],
        "asOf": _now_epoch(),
        "meta": {"cache_ttl": int(cache_ttl)},
    }

    _CACHE.set(cache_key, out, int(cache_ttl))
    return out
