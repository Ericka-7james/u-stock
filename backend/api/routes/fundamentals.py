# api/routes/fundamentals.py
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.clients.fundamentals_client import alpha_company_overview

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fundamentals", tags=["fundamentals"])

# Simple in-process cache (per worker). Good for reducing provider calls.
# If you want cross-worker caching later, move this to Redis/Supabase.
_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours
_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


# -------------------------
# Models
# -------------------------
class FundamentalsOut(BaseModel):
    ok: bool = True
    symbol: str
    provider: str = "alpha_vantage"
    as_of: int = Field(..., description="Unix seconds when this response was generated")
    cache: Dict[str, Any] = Field(default_factory=dict, description="Cache info: hit/age/ttl")

    # Normalized "bot-friendly" fields
    company: Dict[str, Any] = Field(default_factory=dict)
    valuation: Dict[str, Any] = Field(default_factory=dict)
    profitability: Dict[str, Any] = Field(default_factory=dict)
    growth: Dict[str, Any] = Field(default_factory=dict)
    balance_sheet: Dict[str, Any] = Field(default_factory=dict)
    trading: Dict[str, Any] = Field(default_factory=dict)
    risk: Dict[str, Any] = Field(default_factory=dict)

    # Optional raw provider payload
    raw: Optional[Dict[str, Any]] = None


# -------------------------
# Helpers
# -------------------------
def _clean_symbol(symbol: str) -> str:
    s = (symbol or "").upper().strip()
    # allow letters, numbers, dot, dash (e.g. BRK.B)
    if not s or len(s) > 16:
        return ""
    for ch in s:
        if not (ch.isalnum() or ch in {".", "-"}):
            return ""
    return s


def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip()
    if not s or s.lower() in {"none", "null", "nan"}:
        return None
    try:
        return float(s)
    except Exception:
        return None


def _to_int(v: Any) -> Optional[int]:
    f = _to_float(v)
    if f is None:
        return None
    try:
        return int(f)
    except Exception:
        return None


def _to_pct(v: Any) -> Optional[float]:
    """
    Provider often returns decimals as strings (e.g. "0.1234") or percents.
    We normalize to *percent* (0-100) float when it looks like a decimal.
    """
    f = _to_float(v)
    if f is None:
        return None
    # heuristic: if between -1 and 1, treat as ratio and convert to %
    if -1.0 <= f <= 1.0:
        return f * 100.0
    return f


def _norm_alpha_overview(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Alpha Vantage Company Overview fields we care about for bots:
      - valuation filters (MarketCap, PERatio, PEGRatio, PriceToBookRatio)
      - risk (Beta)
      - liquidity/float (SharesOutstanding)
      - profitability (ProfitMargin, OperatingMarginTTM, ReturnOnEquityTTM)
      - growth (QuarterlyEarningsGrowthYOY, QuarterlyRevenueGrowthYOY)
      - trading context (52WeekHigh/Low, 50/200-day moving avg)
    We normalize into buckets for easier strategy consumption.
    """
    # Alpha keys are usually TitleCase strings.
    get = raw.get

    company = {
        "name": get("Name") or get("CompanyName"),
        "description": get("Description"),
        "exchange": get("Exchange"),
        "currency": get("Currency"),
        "country": get("Country"),
        "sector": get("Sector"),
        "industry": get("Industry"),
    }

    valuation = {
        "market_cap": _to_int(get("MarketCapitalization") or get("MarketCap")),
        "pe": _to_float(get("PERatio") or get("PE")),
        "peg": _to_float(get("PEGRatio") or get("PEG")),
        "ps": _to_float(get("PriceToSalesRatioTTM") or get("PriceToSales")),
        "pb": _to_float(get("PriceToBookRatio") or get("PB")),
        "ev_to_ebitda": _to_float(get("EVToEBITDA")),
    }

    profitability = {
        "profit_margin_pct": _to_pct(get("ProfitMargin")),
        "operating_margin_pct": _to_pct(get("OperatingMarginTTM") or get("OperatingMargin")),
        "roe_pct": _to_pct(get("ReturnOnEquityTTM") or get("ROE")),
        "roa_pct": _to_pct(get("ReturnOnAssetsTTM") or get("ROA")),
        "ebitda": _to_float(get("EBITDA")),
    }

    growth = {
        "rev_growth_yoy_pct": _to_pct(get("QuarterlyRevenueGrowthYOY")),
        "earnings_growth_yoy_pct": _to_pct(get("QuarterlyEarningsGrowthYOY")),
    }

    balance_sheet = {
        "shares_outstanding": _to_int(get("SharesOutstanding")),
        "book_value": _to_float(get("BookValue")),
    }

    trading = {
        "52w_high": _to_float(get("52WeekHigh") or get("52WeekHigh")),
        "52w_low": _to_float(get("52WeekLow") or get("52WeekLow")),
        "50d_ma": _to_float(get("50DayMovingAverage") or get("50DayMA")),
        "200d_ma": _to_float(get("200DayMovingAverage") or get("200DayMA")),
        "dividend_yield_pct": _to_pct(get("DividendYield")),
        "dividend_per_share": _to_float(get("DividendPerShare")),
    }

    risk = {
        "beta": _to_float(get("Beta")),
        # optional: analysts / sentiment-ish fields if present
        "analyst_target_price": _to_float(get("AnalystTargetPrice")),
    }

    # Keep only non-empty values to reduce noise
    def compact(d: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in d.items() if v not in (None, "", {})}

    return {
        "company": compact(company),
        "valuation": compact(valuation),
        "profitability": compact(profitability),
        "growth": compact(growth),
        "balance_sheet": compact(balance_sheet),
        "trading": compact(trading),
        "risk": compact(risk),
    }


def _cache_get(symbol: str) -> Optional[Tuple[int, Dict[str, Any]]]:
    hit = _cache.get(symbol)
    if not hit:
        return None
    ts, payload = hit
    age = time.time() - ts
    if age > _CACHE_TTL_SECONDS:
        _cache.pop(symbol, None)
        return None
    return int(ts), payload


def _cache_set(symbol: str, payload: Dict[str, Any]) -> None:
    _cache[symbol] = (time.time(), payload)


# -------------------------
# Endpoints
# -------------------------
@router.get("/overview", response_model=FundamentalsOut)
def overview(
    symbol: str = Query(..., description="Ticker symbol, e.g. AAPL or BRK.B"),
    include_raw: bool = Query(False, description="Include raw provider response"),
    refresh: bool = Query(False, description="Bypass cache and refetch provider data"),
):
    """
    Fundamentals endpoint intended to feed bots + UI:
      - Returns normalized fields for screening and risk filters.
      - Optional raw provider payload for debugging.
      - In-process caching to reduce provider calls.
    """
    sym = _clean_symbol(symbol)
    if not sym:
        raise HTTPException(status_code=400, detail="symbol is required (letters/numbers/. -)")

    now = int(time.time())

    if not refresh:
        cached = _cache_get(sym)
        if cached is not None:
            ts, payload = cached
            out = dict(payload)
            out["as_of"] = now
            out["cache"] = {"hit": True, "age_seconds": max(0, now - ts), "ttl_seconds": _CACHE_TTL_SECONDS}
            if not include_raw:
                out["raw"] = None
            return out

    try:
        raw = alpha_company_overview(sym) or {}
        normalized = _norm_alpha_overview(raw)

        payload: Dict[str, Any] = {
            "ok": True,
            "symbol": sym,
            "provider": "alpha_vantage",
            "as_of": now,
            "cache": {"hit": False, "age_seconds": 0, "ttl_seconds": _CACHE_TTL_SECONDS},
            **normalized,
            "raw": raw if include_raw else None,
        }

        # Cache the version *without* raw to keep memory smaller
        cache_payload = dict(payload)
        cache_payload["raw"] = None
        cache_payload["cache"] = {"hit": False, "age_seconds": 0, "ttl_seconds": _CACHE_TTL_SECONDS}
        cache_payload["as_of"] = now
        _cache_set(sym, cache_payload)

        return payload

    except HTTPException:
        raise
    except Exception:
        log.exception("fundamentals_overview_failed symbol=%s", sym)
        # don’t leak internal errors; upstream provider failures map to 502
        raise HTTPException(status_code=502, detail="fundamentals_failed")
