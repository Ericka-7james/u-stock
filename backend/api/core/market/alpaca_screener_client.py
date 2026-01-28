from __future__ import annotations

import os
from typing import Any, Dict, List

import requests
from fastapi import HTTPException

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip().rstrip("/")
REQUEST_TIMEOUT_SECONDS = int(os.getenv("ALPACA_HTTP_TIMEOUT", "12"))


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
    }


def _safe_get(url: str, headers: Dict[str, str], params: Dict[str, Any]) -> requests.Response:
    try:
        return requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"alpaca_network_error: {repr(e)}")


def _safe_num(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _norm_pct(raw: Any) -> float:
    """
    Normalize percent-change into "percent points".
    - 0.0123 => 1.23
    - 1.23   => 1.23
    - 123    => 1.23 (scaled/bps-ish)
    """
    v = _safe_num(raw, 0.0)
    av = abs(v)
    if 0 < av <= 1.0:
        return v * 100.0
    if av > 200.0:
        return v / 100.0
    return v


def normalize_screener_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Alpaca screener rows into a consistent shape.
    We primarily need symbol + percent change for scoring.
    """
    sym = str(row.get("symbol") or row.get("S") or row.get("ticker") or "").upper().strip()

    change_raw = (
        row.get("percent_change")
        or row.get("change_pct")
        or row.get("changePct")
        or row.get("pct_change")
        or row.get("pc")
        or 0
    )

    change_pct = _norm_pct(change_raw)

    return {"symbol": sym, "changePct": change_pct, "raw": row}


def fetch_top_gainers(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Alpaca endpoint:
      GET /v1beta1/screener/stocks/gainers?limit=N
    """
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/gainers"
    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params={"limit": int(limit)})

    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail=f"alpaca_top_gainers_auth_error {r.status_code}: {r.text}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"alpaca_top_gainers_error {r.status_code}: {r.text}")

    data = r.json() or {}
    if isinstance(data, list):
        return data
    return data.get("gainers") or data.get("data") or []


def fetch_most_actives(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Alpaca endpoint:
      GET /v1beta1/screener/stocks/most-actives?limit=N
    """
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/most-actives"
    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params={"limit": int(limit)})

    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail=f"alpaca_most_active_auth_error {r.status_code}: {r.text}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"alpaca_most_active_error {r.status_code}: {r.text}")

    data = r.json() or {}
    if isinstance(data, list):
        return data
    return data.get("most_actives") or data.get("data") or []
