# backend/api/routes/market_leaders.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

router = APIRouter(prefix="/api/market", tags=["market"])

ALPACA_DATA_BASE = os.getenv("ALPACA_DATA_BASE", "https://data.alpaca.markets").rstrip("/")

# in-memory cache
_CACHE: Dict[str, Dict[str, Any]] = {}


def _now_epoch() -> int:
    return int(time.time())


def _cache_get(key: str):
    e = _CACHE.get(key)
    if not e:
        return None
    if time.time() > e["expires_at"]:
        _CACHE.pop(key, None)
        return None
    return e["value"]


def _cache_set(key: str, value: Any, ttl: int):
    _CACHE[key] = {"value": value, "expires_at": time.time() + ttl}


def _num(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        if v != v:  # NaN
            return None
        return v
    except Exception:
        return None


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
    }


def _get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Uses your existing helper in api/routes/top_tickers.py
    Returns: (user_id, api_key, api_secret, mode)
    """
    try:
        from api.routes.top_tickers import _get_user_alpaca_creds as _creds
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Missing Alpaca credential helper: {repr(e)}")
    return _creds(request, response)


def _fetch_movers_symbols(api_key: str, api_secret: str, direction: str, limit: int) -> List[str]:
    """
    Movers endpoint varies by plan. We'll try it.
    If it 404s, fallback to a safe universe so UI still renders.
    """
    url = f"{ALPACA_DATA_BASE}/v1beta1/screener/stocks/movers"
    params = {"top": limit, "direction": direction}

    r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), params=params, timeout=12)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED", "message": "Alpaca rejected keys."})

    if r.status_code == 404:
        universe = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSLA", "META", "AMD", "AMZN", "GOOGL"]
        return universe[:limit]

    if not r.ok:
        raise HTTPException(status_code=502, detail=f"alpaca_movers_error {r.status_code}: {r.text}")

    data = r.json()
    items = data.get("movers") or data.get("data") or data.get("items") or data
    if isinstance(items, dict):
        items = items.get("movers") or items.get("items") or []
    if not isinstance(items, list):
        items = []

    out: List[str] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        sym = it.get("symbol") or it.get("ticker")
        if sym:
            out.append(str(sym).upper())

    return out[:limit]


def _fetch_snapshots(api_key: str, api_secret: str, symbols: List[str]) -> Dict[str, Any]:
    """
    ✅ This is the KEY call that provides previous close.
    GET /v2/stocks/snapshots?symbols=AAPL,MSFT,...

    Returns per-symbol snapshot including:
      latestTrade.p  (last trade price)
      prevDailyBar.c (previous close)
    """
    if not symbols:
        return {}

    url = f"{ALPACA_DATA_BASE}/v2/stocks/snapshots"
    params = {"symbols": ",".join(symbols)}

    r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), params=params, timeout=12)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED", "message": "Alpaca rejected keys."})

    if not r.ok:
        raise HTTPException(status_code=502, detail=f"alpaca_snapshots_error {r.status_code}: {r.text}")

    data = r.json()
    return data if isinstance(data, dict) else {}


def _extract_last_prev(snap: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    last = None
    prev = None

    lt = snap.get("latestTrade") or {}
    if isinstance(lt, dict):
        last = lt.get("p") or lt.get("price")

    prev_bar = snap.get("prevDailyBar") or {}
    if isinstance(prev_bar, dict):
        prev = prev_bar.get("c") or prev_bar.get("close")

    last_f = _num(last)
    prev_f = _num(prev)

    # ✅ Do NOT convert missing values into 0.0
    # Leave them as None so UI shows "—" instead of fake 0.
    if last_f is not None and last_f <= 0:
        last_f = None
    if prev_f is not None and prev_f <= 0:
        prev_f = None

    return last_f, prev_f


@router.get("/leaders")
def market_leaders(
    request: Request,
    response: Response,
    market: str = Query("stocks", pattern="^(stocks)$"),
    direction: str = Query("up", pattern="^(up|down)$"),
    limit: int = Query(8, ge=1, le=25),
    cache_ttl: int = Query(20, ge=5, le=120),
):
    """
    Returns:
      {
        ok: true,
        source: { id, label },
        market, direction,
        items: [{ symbol, score, last, prevClose }],
        asOf: epoch
      }

    score = ((last - prevClose) / prevClose) * 100
    """
    cache_key = f"leaders:{market}:{direction}:{limit}:{cache_ttl}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    if market != "stocks":
        out = {
            "ok": True,
            "source": {"id": "alpaca", "label": "ALPACA"},
            "market": market,
            "direction": direction,
            "items": [],
            "asOf": _now_epoch(),
        }
        _cache_set(cache_key, out, ttl=cache_ttl)
        return out

    _, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    # 1) MOVERS -> symbols
    syms = _fetch_movers_symbols(api_key, api_secret, direction=direction, limit=limit)

    # 2) SNAPSHOTS -> last + prevDailyBar.close
    snaps = _fetch_snapshots(api_key, api_secret, syms)

    # 3) Compute score from real numbers (no 0 placeholders)
    items: List[Dict[str, Any]] = []
    for sym in syms:
        snap = snaps.get(sym) or {}
        last, prev = _extract_last_prev(snap)

        score = None
        if last is not None and prev is not None and prev > 0:
            score = ((last - prev) / prev) * 100.0

        items.append({"symbol": sym, "score": score, "last": last, "prevClose": prev})

    # Sort: score desc (missing scores sink)
    def sort_key(r: Dict[str, Any]) -> float:
        v = _num(r.get("score"))
        return v if v is not None else -10_000

    items.sort(key=sort_key, reverse=True)

    out = {
        "ok": True,
        "source": {"id": "alpaca", "label": "ALPACA"},
        "market": market,
        "direction": direction,
        "mode": mode,
        "items": items[:limit],
        "asOf": _now_epoch(),
    }
    _cache_set(cache_key, out, ttl=cache_ttl)
    return out
