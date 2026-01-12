# backend/api/routes/market_leaders.py
from __future__ import annotations

import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

router = APIRouter(prefix="/api/market", tags=["market"])

ALPACA_DATA_BASE = os.getenv("ALPACA_DATA_BASE", "https://data.alpaca.markets").rstrip("/")

# In-memory cache
_CACHE: Dict[str, Dict[str, Any]] = {}

# bump this whenever you change filtering logic so old cache keys don't collide
_CACHE_VERSION = "v3-alphaonly"

# ✅ STRICT: no dots, no numbers, no dashes, etc.
_ALPHA_ONLY = re.compile(r"^[A-Z]+$")


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


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
    }


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


def _is_alpha_only_symbol(sym: str) -> bool:
    s = (sym or "").strip().upper()
    if not s:
        return False
    return bool(_ALPHA_ONLY.match(s))


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


def _fetch_movers(api_key: str, api_secret: str, direction: str, limit: int) -> List[Dict[str, Any]]:
    """
    Tries Alpaca movers endpoint.
    If it 404s, fallback to a safe universe.
    Returns list of dicts with at least {symbol, ...}
    """
    url = f"{ALPACA_DATA_BASE}/v1beta1/screener/stocks/movers"
    params = {"top": limit, "direction": direction}

    r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), params=params, timeout=12)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED", "message": "Alpaca rejected keys."})

    if r.status_code == 404:
        # fallback list is already TV-safe
        universe = ["SPY", "QQQ", "IWM", "AAPL", "MSFT", "NVDA", "TSLA", "META", "AMD", "AMZN", "GOOGL"]
        return [{"symbol": s, "changePct": None} for s in universe[:limit]]

    if not r.ok:
        raise HTTPException(status_code=502, detail=f"alpaca_movers_error {r.status_code}: {r.text}")

    data = r.json()
    items = data.get("movers") or data.get("data") or data.get("items") or data
    if isinstance(items, dict):
        items = items.get("movers") or items.get("items") or []
    if not isinstance(items, list):
        items = []

    out: List[Dict[str, Any]] = []
    for it in items:
        if isinstance(it, dict):
            sym = it.get("symbol") or it.get("ticker")
            if sym:
                out.append(it)
    return out


def _fetch_snapshots(api_key: str, api_secret: str, symbols: List[str]) -> Dict[str, Any]:
    """
    GET /v2/stocks/snapshots?symbols=AAPL,MSFT,...
    """
    if not symbols:
        return {}

    url = f"{ALPACA_DATA_BASE}/v2/stocks/snapshots"
    params = {"symbols": ",".join(symbols)}

    r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), params=params, timeout=12)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED", "message": "Alpaca rejected keys."})

    if not r.ok:
        # If snapshots fail, we still return symbols with changePct if movers provided it
        return {}

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
    limit: int = Query(10, ge=1, le=25),          # ✅ default top 10
    cache_ttl: int = Query(20, ge=5, le=120),
    fetch_multiplier: int = Query(15, ge=2, le=30),  # ✅ pull extra, then filter down to 10 clean
    cache_bust: int = Query(0, ge=0, le=1),
):
    """
    ✅ Returns leaders filtered so frontend NEVER sees:
       dots (VLN.WS), numbers (BRK.B / GOOG1), dashes, slashes, spaces, etc.

    Rule: symbol must match /^[A-Z]+$/.

    Response:
      {
        ok: true,
        source: "ALPACA",
        items: [{ symbol, score, last, prevClose, changePct? }],
        ...
      }
    """
    cache_key = f"{_CACHE_VERSION}:leaders:{market}:{direction}:{limit}:{cache_ttl}:{fetch_multiplier}:{cache_bust}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    if market != "stocks":
        out = {
            "ok": True,
            "source": "ALPACA",
            "market": market,
            "direction": direction,
            "items": [],
            "asOf": _now_epoch(),
        }
        _cache_set(cache_key, out, ttl=cache_ttl)
        return out

    _, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    raw_limit = min(max(limit * fetch_multiplier, limit), 500)
    raw = _fetch_movers(api_key, api_secret, direction=direction, limit=raw_limit)

    # 1) Filter symbols immediately: only A-Z
    cleaned: List[Dict[str, Any]] = []
    seen = set()

    for it in raw:
        sym = (it.get("symbol") or it.get("ticker") or "").strip().upper()
        if not _is_alpha_only_symbol(sym):
            continue
        if sym in seen:
            continue
        seen.add(sym)
        cleaned.append({"symbol": sym, **it})

        if len(cleaned) >= limit:
            break

    # 2) Optional: pull snapshots for last/prev close if we have symbols
    syms = [x["symbol"] for x in cleaned]
    snaps = _fetch_snapshots(api_key, api_secret, syms)

    items: List[Dict[str, Any]] = []
    for it in cleaned:
        sym = it["symbol"]
        snap = snaps.get(sym) or {}
        last, prev = _extract_last_prev(snap)

        # Use movers % if present, else compute from last/prev
        change_pct = _num(it.get("changePct") or it.get("change_percent") or it.get("percent_change"))
        score = change_pct
        if score is None and last is not None and prev is not None and prev > 0:
            score = ((last - prev) / prev) * 100.0

        items.append(
            {
                "symbol": sym,
                "score": score,
                "changePct": change_pct,  # optional; UI can use score anyway
                "last": last,
                "prevClose": prev,
                "direction": direction,
            }
        )

    # Sort by score desc (missing sinks)
    def sort_key(r: Dict[str, Any]) -> float:
        v = _num(r.get("score"))
        return v if v is not None else -10_000

    items.sort(key=sort_key, reverse=True)
    items = items[:limit]

    out = {
        "ok": True,
        "source": "ALPACA",
        "market": market,
        "direction": direction,
        "mode": mode,
        "items": items,
        "asOf": _now_epoch(),
        "meta": {
            "requested_limit": limit,
            "raw_limit": raw_limit,
            "raw_count": len(raw) if isinstance(raw, list) else 0,
            "returned": len(items),
            "filter": "alpha_only /^[A-Z]+$/ (no dots, numbers, dashes, slashes, spaces)",
        },
    }

    _cache_set(cache_key, out, ttl=cache_ttl)
    return out
