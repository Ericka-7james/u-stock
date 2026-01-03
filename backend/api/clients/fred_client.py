# api/clients/fred_client.py
import os
import time
from typing import Any, Dict

import requests

FRED_API_KEY = os.getenv("FRED_API_KEY", "").strip()
FRED_BASE = "https://api.stlouisfed.org/fred"

_cache: Dict[str, Any] = {}
_cache_exp: Dict[str, float] = {}


def _cache_get(key: str):
    now = time.time()
    if key in _cache and _cache_exp.get(key, 0) > now:
        return _cache[key]
    return None


def _cache_set(key: str, value: Any, ttl_sec: int):
    _cache[key] = value
    _cache_exp[key] = time.time() + ttl_sec


def fred_series_observations(series_id: str, ttl_sec: int = 3600) -> Dict[str, Any]:
    """
    Calls FRED /series/observations and caches results.
    Returns {"cached": bool, "data": <fred json>}
    """
    if not FRED_API_KEY:
        raise RuntimeError("FRED_API_KEY missing")

    series_id = (series_id or "").strip()
    if not series_id:
        raise ValueError("series_id is required")

    key = f"fred:series_observations:{series_id}"
    cached = _cache_get(key)
    if cached is not None:
        return {"cached": True, "data": cached}

    url = f"{FRED_BASE}/series/observations"
    params = {"series_id": series_id, "api_key": FRED_API_KEY, "file_type": "json"}
    r = requests.get(url, params=params, timeout=8)
    r.raise_for_status()
    data = r.json()

    _cache_set(key, data, ttl_sec)
    return {"cached": False, "data": data}


# ✅ Compatibility export: use this name in api/routes/macro.py
def get_series_observations(series_id: str, ttl_sec: int = 3600) -> Dict[str, Any]:
    """
    Backwards-compatible name for routes that import get_series_observations.
    """
    return fred_series_observations(series_id=series_id, ttl_sec=ttl_sec)
