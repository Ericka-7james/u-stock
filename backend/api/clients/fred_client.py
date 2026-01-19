# backend/api/clients/fred_client.py
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import requests


FRED_BASE = "https://api.stlouisfed.org/fred"


def _fred_key() -> str:
    return os.getenv("FRED_API_KEY", "").strip()


def _require_key() -> str:
    key = _fred_key()
    if not key:
        raise RuntimeError("FRED_API_KEY is missing")
    return key


def _get_json(url: str, params: Dict[str, Any]) -> Dict[str, Any]:
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def _latest_two_points(series_id: str) -> Tuple[float, float]:
    """
    Returns (latest_value, value_12_months_ago-ish) using the latest 13 monthly observations.
    Works well for monthly series like CPIAUCSL.
    """
    key = _require_key()
    data = _get_json(
        f"{FRED_BASE}/series/observations",
        {
            "series_id": series_id,
            "api_key": key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": 13,
        },
    )
    obs = data.get("observations", [])
    vals = []
    for o in obs:
        v = o.get("value")
        if v is None or v == ".":
            continue
        vals.append(float(v))

    if len(vals) < 2:
        raise RuntimeError(f"Not enough observations for {series_id}")

    latest = vals[0]
    approx_12m_ago = vals[-1]
    return latest, approx_12m_ago


def _latest_point(series_id: str) -> float:
    key = _require_key()
    data = _get_json(
        f"{FRED_BASE}/series/observations",
        {
            "series_id": series_id,
            "api_key": key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": 10,
        },
    )
    obs = data.get("observations", [])
    for o in obs:
        v = o.get("value")
        if v is None or v == ".":
            continue
        return float(v)
    raise RuntimeError(f"No valid observation found for {series_id}")


@dataclass(frozen=True)
class MacroSnapshot:
    fed_funds: float          # DFF
    ten_year_yield: float     # DGS10
    cpi_yoy: float            # CPIAUCSL YoY %
    unemployment: float       # UNRATE
    risk: str                 # Low/Medium/High


# simple TTL cache so dashboard doesn’t hammer FRED
_CACHE: Optional[Tuple[float, Dict[str, Any]]] = None


def _risk_signal(fed_funds: float, ten_year: float, cpi_yoy: float, unrate: float) -> str:
    """
    Simple scoring:
      +1 if Fed Funds >= 4.5
      +1 if 10Y >= 4.5
      +1 if CPI YoY >= 3.5
      +1 if Unemployment >= 4.5
    0-1 = Low, 2 = Medium, 3-4 = High
    """
    score = 0
    score += 1 if fed_funds >= 4.5 else 0
    score += 1 if ten_year >= 4.5 else 0
    score += 1 if cpi_yoy >= 3.5 else 0
    score += 1 if unrate >= 4.5 else 0

    if score <= 1:
        return "Low"
    if score == 2:
        return "Medium"
    return "High"


def get_macro_summary(ttl_seconds: int = 600) -> Dict[str, Any]:
    """
    Returns a compact macro summary used by the dashboard.
    Cached for ttl_seconds.
    """
    global _CACHE

    now = time.time()
    if _CACHE is not None:
        expires_at, payload = _CACHE
        if now < expires_at:
            return payload

    # series:
    # DFF = Effective Federal Funds Rate
    # DGS10 = 10-Year Treasury Constant Maturity Rate
    # CPIAUCSL = CPI (index), compute YoY %
    # UNRATE = Unemployment rate
    fed_funds = _latest_point("DFF")
    ten_year = _latest_point("DGS10")

    cpi_latest, cpi_12m = _latest_two_points("CPIAUCSL")
    cpi_yoy = ((cpi_latest / cpi_12m) - 1.0) * 100.0

    unemployment = _latest_point("UNRATE")

    risk = _risk_signal(fed_funds, ten_year, cpi_yoy, unemployment)

    payload = {
        "ok": True,
        "source": "fred",
        "rates": {
            "fed_funds": fed_funds,
            "ten_year": ten_year,
        },
        "inflation": {
            "cpi_yoy": cpi_yoy,
        },
        "labor": {
            "unemployment": unemployment,
        },
        "risk": risk,
    }

    _CACHE = (now + float(ttl_seconds), payload)
    return payload
