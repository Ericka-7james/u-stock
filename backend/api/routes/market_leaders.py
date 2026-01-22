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

# Some Alpaca accounts/plans require specifying a feed ("iex" or "sip")
ALPACA_DATA_FEED = os.getenv("ALPACA_DATA_FEED", "").strip()  # e.g. "iex"

# In-memory cache (per-process; for multi-worker/multi-instance use Redis)
_CACHE: Dict[str, Dict[str, Any]] = {}

# Versioned cache key format
_CACHE_VERSION = "v8-alpha-only-prevclose-computed-flag-userkey-netguard"

_ALPHA_ONLY = re.compile(r"^[A-Z]+$")

_REQUEST_TIMEOUT_SECONDS = 12


def _now_epoch() -> int:
    return int(time.time())


def _cache_get(key: str):
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time.time() > entry["expires_at"]:
        _CACHE.pop(key, None)
        return None
    return entry["value"]


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
    return bool(_ALPHA_ONLY.fullmatch(s))


def _get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Delegates to top_tickers helper. Expected return shape:
    (user_id, api_key, api_secret, mode)
    """
    try:
        from api.routes.top_tickers import _get_user_alpaca_creds as _creds
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Missing Alpaca credential helper: {repr(e)}")
    return _creds(request, response)


def _safe_get(url: str, headers: Dict[str, str], params: Dict[str, Any]) -> requests.Response:
    try:
        return requests.get(url, headers=headers, params=params, timeout=_REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        # Normalize network errors into a 502 (bad gateway / upstream issue)
        raise HTTPException(status_code=502, detail=f"alpaca_network_error: {repr(e)}")


def _fetch_movers(api_key: str, api_secret: str, direction: str, limit: int) -> List[Dict[str, Any]]:
    url = f"{ALPACA_DATA_BASE}/v1beta1/screener/stocks/movers"
    params = {"top": limit, "direction": direction}

    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params=params)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})

    # Some plans don’t have screener; keep a stable fallback
    if r.status_code == 404:
        fallback = ["AAPL", "MSFT", "NVDA", "TSLA", "META", "AMD", "AMZN", "GOOGL", "NFLX", "INTC"]
        return [{"symbol": s} for s in fallback]

    if not r.ok:
        raise HTTPException(status_code=502, detail=f"alpaca_movers_error {r.status_code}")

    data = r.json()
    items = data.get("movers") or data.get("data") or data.get("items") or []
    if isinstance(items, dict):
        items = items.get("movers") or items.get("items") or []

    out: List[Dict[str, Any]] = []
    for it in items:
        if isinstance(it, dict) and (it.get("symbol") or it.get("ticker")):
            out.append(it)
    return out


def _fetch_snapshots(api_key: str, api_secret: str, symbols: List[str]) -> Dict[str, Any]:
    if not symbols:
        return {}

    url = f"{ALPACA_DATA_BASE}/v2/stocks/snapshots"
    params: Dict[str, Any] = {"symbols": ",".join(symbols)}
    if ALPACA_DATA_FEED:
        params["feed"] = ALPACA_DATA_FEED

    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params=params)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})
    if not r.ok:
        return {}

    data = r.json()
    return data if isinstance(data, dict) else {}


def _extract_last_prev(snapshot: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
    last = None
    lt = snapshot.get("latestTrade") or {}
    if isinstance(lt, dict):
        last = lt.get("p") or lt.get("price")

    prev = None
    prev_bar = snapshot.get("prevDailyBar") or {}
    if isinstance(prev_bar, dict):
        prev = prev_bar.get("c") or prev_bar.get("close")

    last_f = _num(last)
    prev_f = _num(prev)

    if last_f is not None and last_f <= 0:
        last_f = None
    if prev_f is not None and prev_f <= 0:
        prev_f = None

    return last_f, prev_f


def _close_of(bar: Any) -> Optional[float]:
    if not isinstance(bar, dict):
        return None
    v = bar.get("c") if "c" in bar else bar.get("close")
    out = _num(v)
    if out is not None and out <= 0:
        return None
    return out


def _group_bars_any_shape(symbols: List[str], payload: Any) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    if not isinstance(payload, dict):
        return out

    bars = payload.get("bars")

    # Shape 1: {"bars": {"AAPL":[...], "MSFT":[...]}}
    if isinstance(bars, dict):
        for k, v in bars.items():
            sym = str(k).upper()
            if sym not in symbols:
                continue
            if isinstance(v, list):
                out[sym] = [b for b in v if isinstance(b, dict)]
        return out

    # Shape 2: {"bars": [ {S:"AAPL", ...}, {S:"MSFT", ...} ]}
    if isinstance(bars, list):
        has_sym_field = any(isinstance(b, dict) and (("S" in b) or ("symbol" in b)) for b in bars)
        if has_sym_field:
            for b in bars:
                if not isinstance(b, dict):
                    continue
                sym = str(b.get("S") or b.get("symbol") or "").upper().strip()
                if not sym or sym not in symbols:
                    continue
                out.setdefault(sym, []).append(b)
            return out

        # Shape 3: single-symbol list if only one symbol requested
        if len(symbols) == 1:
            sym = symbols[0]
            out[sym] = [b for b in bars if isinstance(b, dict)]
            return out

    return out


def _fetch_prevclose_from_bars_batch(api_key: str, api_secret: str, symbols: List[str]) -> Dict[str, Optional[float]]:
    if not symbols:
        return {}

    url = f"{ALPACA_DATA_BASE}/v2/stocks/bars"
    params: Dict[str, Any] = {
        "symbols": ",".join(symbols),
        "timeframe": "1Day",
        "limit": 2,
        "adjustment": "raw",
    }
    if ALPACA_DATA_FEED:
        params["feed"] = ALPACA_DATA_FEED

    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params=params)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})
    if not r.ok:
        return {}

    data = r.json()
    grouped = _group_bars_any_shape(symbols, data)
    if not grouped:
        return {}

    out: Dict[str, Optional[float]] = {}
    for sym in symbols:
        bars = grouped.get(sym) or []
        if not bars:
            out[sym] = None
            continue

        # Sort by timestamp if present
        if isinstance(bars[0], dict) and "t" in bars[0]:
            try:
                bars = sorted(bars, key=lambda b: b.get("t"))
            except Exception:
                pass

        if len(bars) >= 2:
            out[sym] = _close_of(bars[-2])
        else:
            out[sym] = _close_of(bars[-1])

    return out


def _fetch_prevclose_from_bars_single(api_key: str, api_secret: str, symbol: str) -> Optional[float]:
    url = f"{ALPACA_DATA_BASE}/v2/stocks/{symbol}/bars"
    params: Dict[str, Any] = {"timeframe": "1Day", "limit": 2, "adjustment": "raw"}
    if ALPACA_DATA_FEED:
        params["feed"] = ALPACA_DATA_FEED

    r = _safe_get(url, headers=_alpaca_headers(api_key, api_secret), params=params)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})
    if not r.ok:
        return None

    data = r.json()
    bars = data.get("bars") if isinstance(data, dict) else None
    if not isinstance(bars, list) or not bars:
        return None

    if isinstance(bars[0], dict) and "t" in bars[0]:
        try:
            bars = sorted(bars, key=lambda b: b.get("t"))
        except Exception:
            pass

    if len(bars) >= 2:
        return _close_of(bars[-2])
    return _close_of(bars[-1])


@router.get("/leaders")
def market_leaders(
    request: Request,
    response: Response,
    market: str = Query("stocks", pattern="^(stocks)$"),
    direction: str = Query("up", pattern="^(up|down)$"),
    limit: int = Query(10, ge=1, le=25),
    cache_ttl: int = Query(20, ge=5, le=120),
    fetch_multiplier: int = Query(15, ge=2, le=30),
    cache_bust: int = Query(0, ge=0, le=1),
):
    # IMPORTANT: include user in cache key to avoid cross-user data leakage.
    user_id, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    cache_key = f"{_CACHE_VERSION}:{user_id}:{market}:{direction}:{limit}:{fetch_multiplier}:{cache_bust}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    raw_limit = min(limit * fetch_multiplier, 500)
    raw = _fetch_movers(api_key, api_secret, direction, raw_limit)

    # alpha-only + dedupe
    seen = set()
    symbols: List[str] = []
    for it in raw:
        sym = (it.get("symbol") or it.get("ticker") or "").upper().strip()
        if not _is_alpha_only_symbol(sym):
            continue
        if sym in seen:
            continue
        seen.add(sym)
        symbols.append(sym)
        if len(symbols) >= limit:
            break

    snapshots = _fetch_snapshots(api_key, api_secret, symbols)
    prevclose_batch = _fetch_prevclose_from_bars_batch(api_key, api_secret, symbols)

    items: List[Dict[str, Any]] = []
    computed_prevclose_count = 0

    # for transparency/debug
    batch_hit = 0
    single_hit = 0

    for sym in symbols:
        snap = snapshots.get(sym) or {}
        last, prev = _extract_last_prev(snap)

        prev_computed = False

        if prev is None:
            prev = prevclose_batch.get(sym)
            if prev is not None:
                prev_computed = True
                batch_hit += 1

        if prev is None:
            prev = _fetch_prevclose_from_bars_single(api_key, api_secret, sym)
            if prev is not None:
                prev_computed = True
                single_hit += 1

        if prev_computed:
            computed_prevclose_count += 1

        score = None
        if last is not None and prev is not None and prev > 0:
            score = ((last - prev) / prev) * 100.0

        items.append(
            {
                "symbol": sym,
                "score": score,
                "last": last,
                "prevClose": prev,
                "prevCloseComputed": bool(prev_computed),
                "direction": direction,
            }
        )

    # For "up" we want highest positive first (desc).
    # For "down" we want most negative first (asc).
    reverse = direction == "up"
    items.sort(key=lambda r: _num(r.get("score")) if _num(r.get("score")) is not None else (10_000 if not reverse else -10_000), reverse=reverse)

    base_source = "ALPACA"
    source_label = "ALPACA+Computed" if computed_prevclose_count > 0 else base_source

    out = {
        "ok": True,
        "source": base_source,  # keep stable
        "market": market,
        "direction": direction,
        "mode": mode,
        "items": items,
        "asOf": _now_epoch(),
        "meta": {
            "source_label": source_label,  # UI uses this
            "computed_prevclose_count": computed_prevclose_count,
            "filter": "alpha_only /^[A-Z]+$/",
            "returned": len(items),
            "prevclose_source": "snapshot.prevDailyBar -> bars(batch) -> bars(single)",
            "bars_batch_hit": batch_hit,
            "bars_single_hit": single_hit,
            "feed": ALPACA_DATA_FEED or None,
        },
    }

    _cache_set(cache_key, out, cache_ttl)
    return out
