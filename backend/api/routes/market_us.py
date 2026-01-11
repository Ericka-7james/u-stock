# backend/api/routes/market_leaders.py
from __future__ import annotations

import os
from typing import Any, Dict, List, Tuple

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

from api.core.security import require_user, decrypt_secret, get_supabase_service

router = APIRouter(prefix="/api/market", tags=["market"])

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip()


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
        "Accept": "application/json",
    }


def _load_alpaca_keys(sb, user_id: str) -> Tuple[str, str, str]:
    res = (
        sb.table("integrations")
        .select("api_key_enc,api_secret_enc,mode,status")
        .eq("user_id", user_id)
        .eq("provider", "alpaca")
        .limit(1)
        .execute()
    )

    rows = res.data or []
    row = rows[0] if rows else None
    if not row:
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_NOT_CONNECTED", "message": "Alpaca not connected for this user"},
        )

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_NOT_CONNECTED", "message": "Alpaca is not marked connected"},
        )

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_INVALID_KEY", "message": "Alpaca keys missing or unreadable"},
        )

    return api_key, api_secret, mode


def _safe_num(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _norm_pct(raw: Any) -> float:
    """
    Normalize percent-change into "percent points".
    Handles common shapes:
      - 0.0123 => 1.23%
      - 1.23   => 1.23%
      - 123    => 1.23% (bps-ish / scaled)
    """
    v = _safe_num(raw, 0.0)
    av = abs(v)

    # If it looks like a fraction (<= 1), treat as fraction and multiply by 100
    if av <= 1.0 and av > 0:
        return v * 100.0

    # If it looks massively scaled, divide down
    # (Percent moves almost never exceed 200% for this feed)
    if av > 200.0:
        # First try bps-ish scaling
        return v / 100.0

    return v


def _pick_symbol(it: Dict[str, Any]) -> str:
    sym = it.get("symbol") or it.get("ticker") or it.get("S") or it.get("t") or ""
    return str(sym).upper().strip()


def _pick_change_pct(it: Dict[str, Any]) -> float:
    # Alpaca shapes vary; try the likely fields and normalize
    raw = (
        it.get("change_pct")
        or it.get("changePct")
        or it.get("change_percent")
        or it.get("percent_change")
        or it.get("pct_change")
        or it.get("pc")  # sometimes used elsewhere
        or 0.0
    )
    return _norm_pct(raw)


def _pick_last(it: Dict[str, Any]) -> float:
    return _safe_num(it.get("last") or it.get("last_price") or it.get("price") or it.get("c") or 0.0)


def _pick_prev_close(it: Dict[str, Any]) -> float:
    return _safe_num(it.get("prev_close") or it.get("prevClose") or it.get("previous_close") or it.get("pc") or 0.0)


def _unwrap_payload(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        return {}

    base = payload
    if isinstance(base.get("data"), dict):
        base = base["data"]

    if isinstance(base.get("movers"), dict):
        base = base["movers"]

    return base if isinstance(base, dict) else {}


@router.get("/leaders")
def market_leaders(
    request: Request,
    response: Response,
    market: str = Query("stocks", pattern="^(stocks|crypto)$"),
    direction: str = Query("up", pattern="^(up|down|both)$"),
    limit: int = Query(8, ge=1, le=50),
):
    """
    GET /api/market/leaders?market=stocks&direction=up&limit=8
    """
    try:
        user = require_user(request, response)
        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user["id"])

        url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/{market}/movers"
        r = requests.get(url, headers=_alpaca_headers(api_key, api_secret), timeout=12)

        if r.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "ALPACA_INVALID_KEY",
                    "message": "Alpaca rejected your API keys or you don’t have access.",
                    "hint": "Reconnect Alpaca in Connected Apps and paste keys again.",
                    "provider": "alpaca",
                },
            )

        if r.status_code == 404:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "SOURCE_NOT_FOUND",
                    "message": f"Alpaca movers endpoint returned 404 at {url}",
                    "provider": "alpaca",
                },
            )

        if r.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "ALPACA_SOURCE_ERROR",
                    "message": f"Alpaca movers error {r.status_code}: {r.text}",
                    "provider": "alpaca",
                },
            )

        payload = r.json() or {}
        base = _unwrap_payload(payload)

        gainers = base.get("gainers") or []
        losers = base.get("losers") or []

        def normalize_rows(rows: List[Dict[str, Any]], dir_label: str) -> List[Dict[str, Any]]:
            out: List[Dict[str, Any]] = []
            for it in rows or []:
                if not isinstance(it, dict):
                    continue
                sym = _pick_symbol(it)
                if not sym:
                    continue
                out.append(
                    {
                        "symbol": sym,
                        "changePct": _pick_change_pct(it),
                        "last": _pick_last(it),
                        "prevClose": _pick_prev_close(it),
                        "direction": dir_label,
                    }
                )
            return out

        up_items = normalize_rows(gainers, "up")
        down_items = normalize_rows(losers, "down")

        if direction == "up":
            items = up_items[:limit]
        elif direction == "down":
            items = down_items[:limit]
        else:
            items = (up_items + down_items)[:limit]

        return {
            "ok": True,
            "source": "ALPACA",
            "market": market,
            "direction": direction,
            "mode": mode,
            "items": items,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "MARKET_LEADERS_FAILED", "message": "Server error", "error": repr(e)},
        )
