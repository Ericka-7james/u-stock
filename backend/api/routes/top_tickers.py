# backend/api/routes/top_tickers.py
from __future__ import annotations

import os
import time
from typing import Any, Dict, List, Tuple

import requests
from fastapi import APIRouter, HTTPException, Query, Request, Response

from api.core.security import require_user, decrypt_secret, get_supabase_service

router = APIRouter(prefix="/api/market/us", tags=["market-us"])

ALPACA_DATA_BASE_URL = os.getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets").strip()


def _get_user_alpaca_creds(request: Request, response: Response) -> Tuple[Dict[str, Any], str, str, str]:
    """
    Returns: (user, api_key, api_secret, mode)
    Reads per-user stored Alpaca integration from Supabase 'integrations' table.
    """
    user = require_user(request, response)
    user_id = user["id"]

    sb = get_supabase_service()
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
        raise HTTPException(status_code=400, detail="Alpaca not connected for this user")

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not marked connected")

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca keys missing or unreadable")

    return user, api_key, api_secret, mode


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {"APCA-API-KEY-ID": api_key, "APCA-API-SECRET-KEY": api_secret}


def _normalize(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize Alpaca screener rows into a consistent shape.
    We primarily need symbol + percent change for scoring.
    """
    sym = str(row.get("symbol") or row.get("S") or "").upper().strip()

    change_pct = (
        row.get("percent_change")
        or row.get("change_pct")
        or row.get("changePct")
        or row.get("pct_change")
        or 0
    )

    try:
        change_pct = float(change_pct)
    except Exception:
        change_pct = 0.0

    return {"symbol": sym, "changePct": change_pct, "raw": row}


def _fetch_top_gainers(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Alpaca screener endpoint:
      GET /v1beta1/screener/stocks/gainers?limit=N
    """
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/gainers"
    r = requests.get(url, params={"limit": int(limit)}, headers=_alpaca_headers(api_key, api_secret), timeout=12)

    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail=f"alpaca_top_gainers_auth_error {r.status_code}: {r.text}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"alpaca_top_gainers_error {r.status_code}: {r.text}")

    data = r.json() or {}
    if isinstance(data, list):
        return data
    return data.get("gainers") or data.get("data") or []


def _fetch_most_actives(api_key: str, api_secret: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Alpaca screener endpoint:
      GET /v1beta1/screener/stocks/most-actives?limit=N
    """
    url = f"{ALPACA_DATA_BASE_URL}/v1beta1/screener/stocks/most-actives"
    r = requests.get(url, params={"limit": int(limit)}, headers=_alpaca_headers(api_key, api_secret), timeout=12)

    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail=f"alpaca_most_active_auth_error {r.status_code}: {r.text}")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"alpaca_most_active_error {r.status_code}: {r.text}")

    data = r.json() or {}
    if isinstance(data, list):
        return data
    return data.get("most_actives") or data.get("data") or []


@router.get("/top-tickers")
def top_tickers(
    request: Request,
    response: Response,
    source: str = Query("top_gainers", pattern="^(most_active|top_gainers)$"),
    limit: int = Query(12, ge=1, le=50),
):
    """
    Debug endpoint you can hit manually:
      GET /api/market/us/top-tickers?source=top_gainers&limit=12
    """
    _, api_key, api_secret, mode = _get_user_alpaca_creds(request, response)

    pull_n = max(limit * 2, limit)
    raw = _fetch_most_actives(api_key, api_secret, pull_n) if source == "most_active" else _fetch_top_gainers(api_key, api_secret, pull_n)

    items = []
    for r in (raw or []):
        try:
            items.append(_normalize(r))
        except Exception:
            continue

    return {"ok": True, "mode": mode, "source": f"alpaca_{source}", "count": len(items), "items": items[:limit], "asOf": int(time.time())}
