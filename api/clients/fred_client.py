# api/clients/fred_client.py
import os, time, requests
from typing import Dict, Any

FRED_API_KEY = os.getenv("FRED_API_KEY", "").strip()
FRED_BASE = "https://api.stlouisfed.org/fred"

_cache: Dict[str, Any] = {}
_cache_exp: Dict[str, float] = {}

def fred_series_observations(series_id: str, ttl_sec: int = 3600) -> Dict[str, Any]:
    if not FRED_API_KEY:
        raise RuntimeError("FRED_API_KEY missing")

    now = time.time()
    key = f"fred:{series_id}"
    if key in _cache and _cache_exp.get(key, 0) > now:
        return {"cached": True, "data": _cache[key]}

    url = f"{FRED_BASE}/series/observations"
    params = {"series_id": series_id, "api_key": FRED_API_KEY, "file_type": "json"}
    r = requests.get(url, params=params, timeout=8)
    r.raise_for_status()
    data = r.json()

    _cache[key] = data
    _cache_exp[key] = now + ttl_sec
    return {"cached": False, "data": data}
