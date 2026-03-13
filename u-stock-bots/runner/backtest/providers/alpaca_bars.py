from __future__ import annotations

import os
import time
import requests
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


_TIMEOUT = 20


def _env(name: str, default: str = "") -> str:
    return str(os.getenv(name) or default).strip()


def _headers() -> Dict[str, str]:
    key = _env("ALPACA_API_KEY_ID")
    sec = _env("ALPACA_API_SECRET_KEY")
    if not key or not sec:
        raise RuntimeError("Missing ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY in environment")
    return {"APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": sec}


def _base() -> str:
    return _env("ALPACA_DATA_BASE", "https://data.alpaca.markets").rstrip("/")


def _to_iso(s: str) -> str:
    """
    Accept YYYY-MM-DD or ISO; return ISO Z.
    """
    raw = (s or "").strip()
    if not raw:
        raise ValueError("start/end is required")

    if len(raw) == 10 and raw[4] == "-" and raw[7] == "-":
        # date-only
        dt = datetime(int(raw[0:4]), int(raw[5:7]), int(raw[8:10]), tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")

    # ISO-ish
    dt = datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def fetch_stock_bars_arrays(
    *,
    symbol: str,
    timeframe: str,
    start: str,
    end: str,
    feed: Optional[str] = None,
    max_pages: int = 200,
    sleep_s: float = 0.15,
) -> Dict[str, Any]:
    """
    Fetches Alpaca stock bars and returns array-form bars:
      {"t":[...], "o":[...], "h":[...], "l":[...], "c":[...], "v":[...]}

    Uses Alpaca Data API v2:
      GET /v2/stocks/{symbol}/bars
    Pagination via page_token.
    """
    sym = str(symbol or "").strip().upper()
    if not sym:
        raise ValueError("symbol required")

    tf = str(timeframe or "").strip()
    if not tf:
        raise ValueError("timeframe required")

    params: Dict[str, Any] = {
        "timeframe": tf,
        "start": _to_iso(start),
        "end": _to_iso(end),
        "limit": 10000,
        "adjustment": "all",
    }
    if feed:
        params["feed"] = feed

    url = f"{_base()}/v2/stocks/{sym}/bars"
    hdrs = _headers()

    items: List[Dict[str, Any]] = []
    page_token: Optional[str] = None

    for _ in range(max_pages):
        if page_token:
            params["page_token"] = page_token
        else:
            params.pop("page_token", None)

        r = requests.get(url, params=params, headers=hdrs, timeout=_TIMEOUT)
        if r.status_code in (401, 403):
            raise RuntimeError(f"Alpaca data auth failed ({r.status_code}). Check keys.")
        if r.status_code == 429:
            # simple backoff
            time.sleep(1.0)
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"Alpaca data error {r.status_code}: {(r.text or '')[:250]}")

        payload = r.json() or {}
        bars = payload.get("bars") or []
        if isinstance(bars, list):
            for b in bars:
                if isinstance(b, dict):
                    items.append(b)

        page_token = payload.get("next_page_token")
        if not page_token:
            break

        time.sleep(max(0.0, float(sleep_s)))

    # Convert items -> arrays expected by your strategy
    # Alpaca returns keys like: t, o, h, l, c, v
    t_out: List[str] = []
    o_out: List[float] = []
    h_out: List[float] = []
    l_out: List[float] = []
    c_out: List[float] = []
    v_out: List[float] = []

    for b in items:
        try:
            t = str(b.get("t") or "")
            o = float(b.get("o"))
            h = float(b.get("h"))
            l = float(b.get("l"))
            c = float(b.get("c"))
            v = float(b.get("v") or 0.0)
        except Exception:
            continue
        if not t:
            continue
        t_out.append(t)
        o_out.append(o)
        h_out.append(h)
        l_out.append(l)
        c_out.append(c)
        v_out.append(v)

    return {"symbol": sym, "tf": tf, "t": t_out, "o": o_out, "h": h_out, "l": l_out, "c": c_out, "v": v_out}