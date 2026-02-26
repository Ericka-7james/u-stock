from __future__ import annotations

from typing import Any, Dict, Optional


def fetch_bars(
    api: Any,
    *,
    symbol: str,
    tf: str,
    limit: int,
    feed: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Live bars fetch via backend endpoint.

    Returns:
        bars dict or None on failure.
    """
    params: Dict[str, Any] = {
        "symbol": symbol,
        "tf": tf,
        "limit": int(limit),
    }

    if feed:
        params["feed"] = feed

    try:
        data = api.get("/api/market/bars", params=params)
        return data if isinstance(data, dict) else None
    except Exception:
        return None

def fetch_bars_from_history(...)