from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import requests
from fastapi import HTTPException

ALPACA_DATA_BASE = os.getenv("ALPACA_DATA_BASE", "https://data.alpaca.markets").rstrip("/")
ALPACA_DATA_FEED = os.getenv("ALPACA_DATA_FEED", "").strip()
_REQUEST_TIMEOUT_SECONDS = 12


def alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
    }


def safe_get(url: str, headers: Dict[str, str], params: Dict[str, Any]) -> requests.Response:
    try:
        return requests.get(url, headers=headers, params=params, timeout=_REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"alpaca_network_error: {repr(e)}")


def fetch_movers(api_key: str, api_secret: str, direction: str, limit: int) -> List[Dict[str, Any]]:
    url = f"{ALPACA_DATA_BASE}/v1beta1/screener/stocks/movers"
    params = {"top": limit, "direction": direction}

    r = safe_get(url, headers=alpaca_headers(api_key, api_secret), params=params)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})

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


def fetch_snapshots(api_key: str, api_secret: str, symbols: List[str]) -> Dict[str, Any]:
    if not symbols:
        return {}

    url = f"{ALPACA_DATA_BASE}/v2/stocks/snapshots"
    params: Dict[str, Any] = {"symbols": ",".join(symbols)}
    if ALPACA_DATA_FEED:
        params["feed"] = ALPACA_DATA_FEED

    r = safe_get(url, headers=alpaca_headers(api_key, api_secret), params=params)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})
    if not r.ok:
        return {}

    data = r.json()
    return data if isinstance(data, dict) else {}


def _num(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        v = float(x)
        if v != v:
            return None
        return v
    except Exception:
        return None


def extract_last_prev(snapshot: Dict[str, Any]) -> Tuple[Optional[float], Optional[float]]:
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


def close_of(bar: Any) -> Optional[float]:
    if not isinstance(bar, dict):
        return None
    v = bar.get("c") if "c" in bar else bar.get("close")
    out = _num(v)
    if out is not None and out <= 0:
        return None
    return out


def group_bars_any_shape(symbols: List[str], payload: Any) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    if not isinstance(payload, dict):
        return out

    bars = payload.get("bars")

    if isinstance(bars, dict):
        for k, v in bars.items():
            sym = str(k).upper()
            if sym not in symbols:
                continue
            if isinstance(v, list):
                out[sym] = [b for b in v if isinstance(b, dict)]
        return out

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

        if len(symbols) == 1:
            sym = symbols[0]
            out[sym] = [b for b in bars if isinstance(b, dict)]
            return out

    return out


def fetch_prevclose_from_bars_batch(api_key: str, api_secret: str, symbols: List[str]) -> Dict[str, Optional[float]]:
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

    r = safe_get(url, headers=alpaca_headers(api_key, api_secret), params=params)

    if r.status_code == 401:
        raise HTTPException(status_code=401, detail={"code": "ALPACA_UNAUTHORIZED"})
    if not r.ok:
        return {}

    data = r.json()
    grouped = group_bars_any_shape(symbols, data)
    if not grouped:
        return {}

    out: Dict[str, Optional[float]] = {}
    for sym in symbols:
        bars = grouped.get(sym) or []
        if not bars:
            out[sym] = None
            continue

        if isinstance(bars[0], dict) and "t" in bars[0]:
            try:
                bars = sorted(bars, key=lambda b: b.get("t"))
            except Exception:
                pass

        if len(bars) >= 2:
            out[sym] = close_of(bars[-2])
        else:
            out[sym] = close_of(bars[-1])

    return out


def fetch_prevclose_from_bars_single(api_key: str, api_secret: str, symbol: str) -> Optional[float]:
    url = f"{ALPACA_DATA_BASE}/v2/stocks/{symbol}/bars"
    params: Dict[str, Any] = {"timeframe": "1Day", "limit": 2, "adjustment": "raw"}
    if ALPACA_DATA_FEED:
        params["feed"] = ALPACA_DATA_FEED

    r = safe_get(url, headers=alpaca_headers(api_key, api_secret), params=params)

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
        return close_of(bars[-2])
    return close_of(bars[-1])
