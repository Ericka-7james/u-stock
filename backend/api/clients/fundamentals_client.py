# backend/api/clients/fundamentals_client.py
from __future__ import annotations

import os
import time
import random
from typing import Dict, Any, Optional

import requests

AV_BASE = "https://www.alphavantage.co/query"

_cache: Dict[str, Any] = {}
_cache_exp: Dict[str, float] = {}


def _cache_get(key: str) -> Optional[Any]:
    now = time.time()
    if key in _cache and _cache_exp.get(key, 0) > now:
        return _cache[key]
    return None


def _cache_set(key: str, value: Any, ttl_sec: int) -> None:
    _cache[key] = value
    _cache_exp[key] = time.time() + max(1, int(ttl_sec))


def _get_api_key() -> str:
    # Read env lazily (avoids import-time env issues during reload)
    return os.getenv("ALPHAVANTAGE_API_KEY", "").strip()


def _sleep_backoff(attempt: int) -> None:
    # small exponential backoff with jitter: 0.25, 0.5, 1.0 (+ jitter)
    base = 0.25 * (2 ** max(0, attempt))
    time.sleep(base + random.uniform(0.0, 0.2))


def _is_av_error_payload(data: Dict[str, Any]) -> bool:
    # AlphaVantage returns 200 with keys like "Note" or "Error Message"
    if not isinstance(data, dict):
        return False
    if "Error Message" in data:
        return True
    if "Note" in data:
        return True
    if "Information" in data:
        # sometimes used for rate limit messaging too
        return True
    return False


def alpha_company_overview(symbol: str, ttl_sec: int = 86400, timeout_sec: int = 12, max_retries: int = 2) -> Dict[str, Any]:
    """
    AlphaVantage Company Overview (fundamentals-ish)
      GET https://www.alphavantage.co/query?function=OVERVIEW&symbol=MSFT&apikey=...

    Returns:
      {"cached": bool, "data": <json>}
    Raises:
      RuntimeError on missing key, http errors, or AV error payload (rate limit, invalid symbol, etc.)
      ValueError on invalid symbol
    """
    api_key = _get_api_key()
    if not api_key:
        raise RuntimeError("ALPHAVANTAGE_API_KEY missing")

    sym = (symbol or "").upper().strip()
    if not sym:
        raise ValueError("symbol is required")

    cache_key = f"av:overview:{sym}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {"cached": True, "data": cached}

    params = {"function": "OVERVIEW", "symbol": sym, "apikey": api_key}

    last_err: Optional[Exception] = None
    for attempt in range(max_retries + 1):
        try:
            r = requests.get(AV_BASE, params=params, timeout=timeout_sec)
            # If AV has transient issues, treat non-2xx as retryable
            if r.status_code >= 400:
                raise RuntimeError(f"alphavantage_http_error {r.status_code}")

            data = r.json() or {}
            if _is_av_error_payload(data):
                # Retry on rate limit style "Note"/"Information"
                msg = data.get("Note") or data.get("Information") or data.get("Error Message") or "AlphaVantage error"
                raise RuntimeError(f"alphavantage_payload_error: {msg}")

            _cache_set(cache_key, data, ttl_sec)
            return {"cached": False, "data": data}

        except Exception as e:
            last_err = e
            if attempt >= max_retries:
                break
            _sleep_backoff(attempt)

    raise RuntimeError(f"alphavantage_overview_failed: {repr(last_err)}")
