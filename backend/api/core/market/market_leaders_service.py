from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional

from api.core.cache.ttl import TTLCache
from api.core.market.alpaca_client import (
    extract_last_prev,
    fetch_movers,
    fetch_prevclose_from_bars_batch,
    fetch_prevclose_from_bars_single,
    fetch_snapshots,
)

_ALPHA_ONLY = re.compile(r"^[A-Z]+$")

_CACHE = TTLCache()
_CACHE_VERSION = "v8-alpha-only-prevclose-computed-flag-userkey-netguard"


def now_epoch() -> int:
    return int(time.time())


def num(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        if v != v:
            return None
        return v
    except Exception:
        return None


def is_alpha_only_symbol(sym: str) -> bool:
    s = (sym or "").strip().upper()
    return bool(_ALPHA_ONLY.fullmatch(s))


def market_leaders(
    *,
    user_id: str,
    api_key: str,
    api_secret: str,
    mode: str,
    market: str,
    direction: str,
    limit: int,
    cache_ttl: int,
    fetch_multiplier: int,
    cache_bust: int,
) -> Dict[str, Any]:
    cache_key = f"{_CACHE_VERSION}:{user_id}:{market}:{direction}:{limit}:{fetch_multiplier}:{cache_bust}"
    if not cache_bust:
        cached = _CACHE.get(cache_key)
        if cached:
            return cached

    raw_limit = min(limit * fetch_multiplier, 500)
    raw = fetch_movers(api_key, api_secret, direction, raw_limit)

    seen = set()
    symbols: List[str] = []
    for it in raw:
        sym = (it.get("symbol") or it.get("ticker") or "").upper().strip()
        if not is_alpha_only_symbol(sym):
            continue
        if sym in seen:
            continue
        seen.add(sym)
        symbols.append(sym)
        if len(symbols) >= limit:
            break

    snapshots = fetch_snapshots(api_key, api_secret, symbols)
    prevclose_batch = fetch_prevclose_from_bars_batch(api_key, api_secret, symbols)

    items: List[Dict[str, Any]] = []
    computed_prevclose_count = 0
    batch_hit = 0
    single_hit = 0

    for sym in symbols:
        snap = snapshots.get(sym) or {}
        last, prev = extract_last_prev(snap)

        prev_computed = False

        if prev is None:
            prev = prevclose_batch.get(sym)
            if prev is not None:
                prev_computed = True
                batch_hit += 1

        if prev is None:
            prev = fetch_prevclose_from_bars_single(api_key, api_secret, sym)
            if prev is not None:
                prev_computed = True
                single_hit += 1

        if prev_computed:
            computed_prevclose_count += 1

        score = None
        if last is not None and prev is not None and prev > 0:
            score = ((last - prev) / prev) * 100.0

        items.append(
            {
                "symbol": sym,
                "score": score,
                "last": last,
                "prevClose": prev,
                "prevCloseComputed": bool(prev_computed),
                "direction": direction,
            }
        )

    reverse = direction == "up"
    items.sort(
        key=lambda r: num(r.get("score")) if num(r.get("score")) is not None else (10_000 if not reverse else -10_000),
        reverse=reverse,
    )

    base_source = "ALPACA"
    source_label = "ALPACA+Computed" if computed_prevclose_count > 0 else base_source

    out = {
        "ok": True,
        "source": base_source,
        "market": market,
        "direction": direction,
        "mode": mode,
        "items": items,
        "asOf": now_epoch(),
        "meta": {
            "source_label": source_label,
            "computed_prevclose_count": computed_prevclose_count,
            "filter": "alpha_only /^[A-Z]+$/",
            "returned": len(items),
            "prevclose_source": "snapshot.prevDailyBar -> bars(batch) -> bars(single)",
            "bars_batch_hit": batch_hit,
            "bars_single_hit": single_hit,
        },
    }

    _CACHE.set(cache_key, out, cache_ttl)
    return out
