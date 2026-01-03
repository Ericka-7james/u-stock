# api/clients/fundamentals_client.py
import os, time, requests
from typing import Dict, Any

ALPHAVANTAGE_API_KEY = os.getenv("ALPHAVANTAGE_API_KEY", "").strip()

_cache: Dict[str, Any] = {}
_cache_exp: Dict[str, float] = {}

def alpha_company_overview(symbol: str, ttl_sec: int = 86400) -> Dict[str, Any]:
    if not ALPHAVANTAGE_API_KEY:
        raise RuntimeError("ALPHAVANTAGE_API_KEY missing")

    sym = symbol.upper().strip()
    now = time.time()
    key = f"av:overview:{sym}"
    if key in _cache and _cache_exp.get(key, 0) > now:
        return {"cached": True, "data": _cache[key]}

    url = "https://www.alphavantage.co/query"
    params = {"function": "OVERVIEW", "symbol": sym, "apikey": ALPHAVANTAGE_API_KEY}
    r = requests.get(url, params=params, timeout=12)
    r.raise_for_status()
    data = r.json()

    _cache[key] = data
    _cache_exp[key] = now + ttl_sec
    return {"cached": False, "data": data}
