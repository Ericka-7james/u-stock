# u-stock-bots/bots/_shared/data/fetch.py
from __future__ import annotations

from typing import Any, Dict, Optional


def _safe_int(x: Any, default: int) -> int:
    try:
        return int(x)
    except Exception:
        return int(default)


def fetch_bars(
    api: Any,
    *,
    symbol: str,
    tf: str,
    limit: int = 200,
    feed: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Fetch bars in a normalized dict format.

    This is intentionally tolerant of different API client shapes:
    - api.get_bars(...)
    - api.fetch_bars(...)
    - api.get_bars_df(...) (converted to dict)

    Returns:
      dict-like payload (or None if no data)
    """
    if api is None:
        raise ValueError("fetch_bars: api is required")

    symbol = str(symbol or "").strip().upper()
    tf = str(tf or "").strip()
    if not symbol or not tf:
        return None

    limit = _safe_int(limit, 200)

    # Prefer get_bars if present
    if hasattr(api, "get_bars"):
        res = api.get_bars(symbol=symbol, tf=tf, limit=limit, feed=feed)
        return _normalize_bars_response(res)

    # Alternate name
    if hasattr(api, "fetch_bars"):
        res = api.fetch_bars(symbol=symbol, tf=tf, limit=limit, feed=feed)
        return _normalize_bars_response(res)

    # Some clients return pandas DF
    if hasattr(api, "get_bars_df"):
        df = api.get_bars_df(symbol=symbol, tf=tf, limit=limit, feed=feed)
        if df is None:
            return None
        try:
            # Expected columns like: t/o/h/l/c/v
            rows = df.reset_index().to_dict(orient="records")
        except Exception:
            rows = []
        return {"items": rows}

    raise RuntimeError(
        "fetch_bars: api does not implement get_bars(), fetch_bars(), or get_bars_df()"
    )


def fetch_bars_from_history(
    api: Any,
    *,
    symbol: str,
    tf: str,
    limit: int = 200,
    feed: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Optional helper if you later want to route to a historical store.
    For now it just delegates to fetch_bars.
    """
    return fetch_bars(api, symbol=symbol, tf=tf, limit=limit, feed=feed)


def _normalize_bars_response(res: Any) -> Optional[Dict[str, Any]]:
    """
    Normalize different bar response shapes into { "items": [...] } when possible.
    """
    if res is None:
        return None

    # Already dict-like
    if isinstance(res, dict):
        # common shapes:
        # - {"items":[...]}
        # - {"bars":[...]}
        if isinstance(res.get("items"), list):
            return res
        if isinstance(res.get("bars"), list):
            return {"items": res.get("bars")}
        return res

    # Some clients return list directly
    if isinstance(res, list):
        return {"items": res}

    # If it looks like an object with .items or .bars
    items = getattr(res, "items", None)
    if isinstance(items, list):
        return {"items": items}

    bars = getattr(res, "bars", None)
    if isinstance(bars, list):
        return {"items": bars}

    return None