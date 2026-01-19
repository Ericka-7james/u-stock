# api/clients/fmp_calendar_client.py
from __future__ import annotations

import os
import time
import requests
from typing import Dict, Any, Tuple, Optional

FMP_BASE = "https://financialmodelingprep.com/api/v3"

# Simple in-memory TTL cache:
# key: (from_date, to_date)
# val: (expires_at_epoch, payload_dict)
_CACHE: Dict[Tuple[str, str], Tuple[float, Dict[str, Any]]] = {}


def _now() -> float:
    return time.time()


def _cache_get(key: Tuple[str, str]) -> Optional[Dict[str, Any]]:
    hit = _CACHE.get(key)
    if not hit:
        return None
    expires_at, payload = hit
    if _now() >= expires_at:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: Tuple[str, str], payload: Dict[str, Any], ttl_sec: int) -> None:
    if ttl_sec <= 0:
        return
    _CACHE[key] = (_now() + float(ttl_sec), payload)


def _validate_calendar_payload(data: Any) -> list:
    """
    FMP economic calendar is expected to be a JSON list of events.
    """
    if isinstance(data, list):
        return data
    raise RuntimeError("fmp_calendar_unexpected_payload")


def fmp_economic_calendar(
    from_date: str,
    to_date: str,
    *,
    timeout_sec: int = 12,
    max_retries: int = 2,
    backoff_base_sec: float = 0.5,
    cache_ttl_sec: int = 900,  # 15 minutes
    base_url: str = FMP_BASE,
) -> Dict[str, Any]:
    """
    Fetch FMP economic calendar for a date range with:
      - env-key validation
      - in-memory TTL caching
      - small retry policy for transient errors (429/5xx/network)
      - payload validation (expects list)

    Returns:
      {"data": [...], "meta": {"cached": bool, "attempts": int}}
    """
    api_key = os.getenv("FMP_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("FMP_API_KEY missing")

    from_date = (from_date or "").strip()
    to_date = (to_date or "").strip()
    if not from_date or not to_date:
        raise ValueError("from_date and to_date are required")

    cache_key = (from_date, to_date)
    cached_payload = _cache_get(cache_key)
    if cached_payload is not None:
        return {
            **cached_payload,
            "meta": {"cached": True, "attempts": 0},
        }

    url = f"{base_url}/economic_calendar"
    params = {"from": from_date, "to": to_date, "apikey": api_key}

    attempts = 0
    last_err: Optional[Exception] = None

    # total attempts = 1 + max_retries
    for attempt in range(1, max_retries + 2):
        attempts = attempt
        try:
            r = requests.get(url, params=params, timeout=timeout_sec)

            # retry-worthy statuses
            if r.status_code == 429 or 500 <= r.status_code <= 599:
                raise RuntimeError(f"fmp_http_transient {r.status_code}")

            # non-retry HTTP errors
            r.raise_for_status()

            data = _validate_calendar_payload(r.json())
            payload: Dict[str, Any] = {"data": data}

            _cache_set(cache_key, payload, cache_ttl_sec)

            return {
                **payload,
                "meta": {"cached": False, "attempts": attempts},
            }

        except (requests.Timeout, requests.ConnectionError) as e:
            last_err = e
        except requests.HTTPError as e:
            # non-transient HTTP errors shouldn't be retried
            raise
        except Exception as e:
            # This includes transient RuntimeError (429/5xx) and payload validation
            last_err = e

        # backoff before next attempt (if we have more attempts)
        if attempt < (max_retries + 1):
            time.sleep(backoff_base_sec * attempt)

    raise RuntimeError(f"fmp_calendar_error: {last_err}")
