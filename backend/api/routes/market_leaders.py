# backend/api/routes/market_leaders.py
from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response

from api.core.integrations.alpaca_creds import get_user_alpaca_creds

router = APIRouter(prefix="/api/market", tags=["market"])

# --------------------------------------------------------------------
# ✅ cache (tests expect this module-level name)
# --------------------------------------------------------------------
_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_VERSION = "v1-market-leaders-route-compat"


def _now_epoch() -> int:
    return int(time.time())


def _cache_get(key: str) -> Optional[Any]:
    with _CACHE_LOCK:
        e = _CACHE.get(key)
        if not e:
            return None
        if time.time() > float(e.get("expires_at", 0)):
            _CACHE.pop(key, None)
            return None
        return e.get("value")


def _cache_set(key: str, value: Any, ttl: int) -> None:
    with _CACHE_LOCK:
        _CACHE[key] = {"value": value, "expires_at": time.time() + float(ttl)}


# --------------------------------------------------------------------
# ✅ test-monkeypatchable hooks (MUST exist)
# --------------------------------------------------------------------
def _get_user_alpaca_creds(request: Request, response: Response):
    return get_user_alpaca_creds(request, response)


def _fetch_movers(api_key: str, api_secret: str, direction: str, limit: int) -> List[Dict[str, Any]]:
    """
    Real implementation should call your service layer.
    Tests monkeypatch this, so this default is only a safe fallback.
    """
    raise HTTPException(status_code=500, detail={"code": "MOVERS_NOT_IMPLEMENTED"})


def _fetch_snapshots(api_key: str, api_secret: str, symbols: List[str]) -> Dict[str, Any]:
    """
    Real implementation should call Alpaca snapshots batch endpoint.
    Tests monkeypatch this.
    """
    raise HTTPException(status_code=500, detail={"code": "SNAPSHOTS_NOT_IMPLEMENTED"})


def _fetch_single_snapshot(api_key: str, api_secret: str, symbol: str) -> Dict[str, Any]:
    """
    Fallback for when a batch snapshot response is missing a symbol.
    Tests may monkeypatch this.
    """
    raise HTTPException(status_code=500, detail={"code": "SINGLE_SNAPSHOT_NOT_IMPLEMENTED"})


def _fetch_prevclose_from_bars_batch(
    api_key: str, api_secret: str, symbols: List[str]
) -> Dict[str, Optional[float]]:
    """
    Batch prev-close lookup. Tests monkeypatch this.
    Return mapping: { "TSLA": 200.0, "MSFT": None }
    """
    return {}


def _fetch_prevclose_from_bars_single(api_key: str, api_secret: str, symbol: str) -> Optional[float]:
    """
    Single-symbol fallback. Tests may monkeypatch this.
    """
    return None


# --------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------
def _is_alpha_symbol(sym: str) -> bool:
    s = (sym or "").strip()
    return bool(s) and s.isalpha()


def _pick_symbol(row: Dict[str, Any]) -> str:
    return str(row.get("symbol") or row.get("ticker") or row.get("S") or "").upper().strip()


def _safe_num(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _last_from_snapshot(snap: Dict[str, Any]) -> float:
    return _safe_num(((snap or {}).get("latestTrade") or {}).get("p"), 0.0)


def _prev_from_snapshot(snap: Dict[str, Any]) -> float:
    return _safe_num(((snap or {}).get("prevDailyBar") or {}).get("c"), 0.0)


def _change_pct(last: float, prev: float) -> float:
    if prev and prev > 0:
        return ((last - prev) / prev) * 100.0
    return 0.0


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
    user_id, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    cache_key = f"{_CACHE_VERSION}:{user_id}:{direction}:{limit}:{cache_ttl}:{fetch_multiplier}:{cache_bust}"
    if not cache_bust:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    fetch_n = max(int(limit) * int(fetch_multiplier), int(limit))
    movers = _fetch_movers(api_key, api_secret, direction, fetch_n)

    # filter alpha + dedupe
    symbols: List[str] = []
    seen = set()
    for r in movers or []:
        if not isinstance(r, dict):
            continue
        sym = _pick_symbol(r)
        if not sym or not _is_alpha_symbol(sym):
            continue
        if sym in seen:
            continue
        seen.add(sym)
        symbols.append(sym)

    symbols = symbols[: int(fetch_n)]

    # batch snapshots
    snaps = _fetch_snapshots(api_key, api_secret, symbols) or {}

    # fallback single snapshot for missing entries
    for sym in symbols:
        if sym not in snaps:
            try:
                snaps[sym] = _fetch_single_snapshot(api_key, api_secret, sym)
            except HTTPException:
                pass

    # batch prevClose from bars (tests patch this)
    prev_map = _fetch_prevclose_from_bars_batch(api_key, api_secret, symbols) or {}

    bars_batch_hit = 0
    bars_single_hit = 0
    computed_prevclose_count = 0

    items: List[Dict[str, Any]] = []
    for sym in symbols:
        snap = snaps.get(sym) or {}
        last = _last_from_snapshot(snap)
        prev = _prev_from_snapshot(snap)

        # ✅ True if we used bars batch/single because prevDailyBar missing
        prev_close_computed = False

        # if snapshot missing prevDailyBar, try bars batch/single
        if prev <= 0:
            pv = prev_map.get(sym)

            # batch provided a usable value
            if pv is not None:
                try:
                    if float(pv) > 0:
                        prev = float(pv)
                        prev_close_computed = True
                        bars_batch_hit += 1
                        computed_prevclose_count += 1
                except Exception:
                    pass
            else:
                # batch missing/None -> use single fallback
                pv_single = _fetch_prevclose_from_bars_single(api_key, api_secret, sym)
                if pv_single is not None:
                    try:
                        if float(pv_single) > 0:
                            prev = float(pv_single)
                            prev_close_computed = True
                            bars_single_hit += 1
                            computed_prevclose_count += 1
                    except Exception:
                        pass

        # still missing: stable fallback (do NOT mark computed)
        if prev <= 0 and last > 0:
            prev = last

        cp = _change_pct(last, prev)
        score = abs(cp)

        items.append(
            {
                "symbol": sym,
                "last": float(last),
                "prevClose": float(prev),
                "prevCloseComputed": bool(prev_close_computed),
                "changePct": float(cp),
                "score": float(score),
                "direction": direction,
            }
        )

    items.sort(key=lambda x: float(x.get("score") or 0.0), reverse=True)

    # ✅ tests want a meta label that reflects whether we computed prevClose from bars
    source_label = "ALPACA+Computed" if computed_prevclose_count > 0 else "ALPACA"

    out = {
        "ok": True,
        "source": "ALPACA",
        "mode": mode,
        "market": market,
        "direction": direction,
        "count": len(items),
        "items": items[: int(limit)],
        "asOf": _now_epoch(),
        "meta": {
            "cache_ttl": int(cache_ttl),
            "bars_batch_hit": int(bars_batch_hit),
            "bars_single_hit": int(bars_single_hit),
            "computed_prevclose_count": int(computed_prevclose_count),
            "source_label": source_label,
        },
    }

    _cache_set(cache_key, out, ttl=int(cache_ttl))
    return out
