# api/clients/fred_client.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional, Tuple

import requests

FRED_BASE = "https://api.stlouisfed.org/fred"

# key -> (expires_at_epoch, value)
_CACHE: Dict[str, Tuple[float, Any]] = {}


def _now() -> float:
    return time.time()


def _cache_get(key: str) -> Optional[Any]:
    hit = _CACHE.get(key)
    if not hit:
        return None
    expires_at, value = hit
    if _now() >= expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any, ttl_sec: int) -> None:
    if ttl_sec <= 0:
        return
    _CACHE[key] = (_now() + float(ttl_sec), value)


def _validate_series_observations_payload(data: Any) -> Dict[str, Any]:
    if not isinstance(data, dict):
        raise RuntimeError("fred_unexpected_payload")
    obs = data.get("observations")
    if obs is None or not isinstance(obs, list):
        raise RuntimeError("fred_missing_observations")
    return data


def fred_series_observations(
    series_id: str,
    *,
    ttl_sec: int = 3600,
    timeout_sec: int = 8,
    max_retries: int = 2,
    backoff_base_sec: float = 0.5,
    base_url: str = FRED_BASE,
) -> Dict[str, Any]:
    """
    Calls FRED /series/observations and caches results.

    Returns:
      {"cached": bool, "data": <fred json>, "meta": {"attempts": int}}
    """
    api_key = os.getenv("FRED_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("FRED_API_KEY missing")

    series_id = (series_id or "").strip()
    if not series_id:
        raise ValueError("series_id is required")

    cache_key = f"fred:series_observations:{series_id}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return {"cached": True, "data": cached, "meta": {"attempts": 0}}

    url = f"{base_url}/series/observations"
    params = {"series_id": series_id, "api_key": api_key, "file_type": "json"}

    attempts = 0
    last_err: Optional[Exception] = None

    for attempt in range(1, max_retries + 2):
        attempts = attempt
        try:
            r = requests.get(url, params=params, timeout=timeout_sec)

            # Retry-worthy status codes
            if r.status_code == 429 or 500 <= r.status_code <= 599:
                raise RuntimeError(f"fred_http_transient {r.status_code}")

            r.raise_for_status()
            data = _validate_series_observations_payload(r.json())

            _cache_set(cache_key, data, ttl_sec)
            return {"cached": False, "data": data, "meta": {"attempts": attempts}}

        except (requests.Timeout, requests.ConnectionError) as e:
            last_err = e
        except requests.HTTPError:
            # non-transient 4xx errors: do not retry
            raise
        except Exception as e:
            # includes transient RuntimeError and validation errors
            last_err = e

        if attempt < (max_retries + 1):
            time.sleep(backoff_base_sec * attempt)

    raise RuntimeError(f"fred_error: {last_err}")


# ✅ Compatibility export: use this name in api/routes/macro.py
def get_series_observations(series_id: str, ttl_sec: int = 3600) -> Dict[str, Any]:
    return fred_series_observations(series_id=series_id, ttl_sec=ttl_sec)
