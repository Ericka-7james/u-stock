# api/alpaca_trading.py
import os
import requests
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request, Response

from .core.security import (
    require_user,
    decrypt_secret,
    get_supabase_service,
)

router = APIRouter(prefix="/alpaca/trading", tags=["alpaca-trading"])


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
        raise HTTPException(status_code=400, detail="Alpaca not connected for this user")

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not marked connected")

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca keys missing or unreadable")

    return api_key, api_secret, mode


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
    }


def _trading_base_url(mode: str) -> str:
    return "https://paper-api.alpaca.markets" if mode == "paper" else "https://api.alpaca.markets"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _parse_dt(s: str) -> datetime:
    s2 = (s or "").replace("Z", "+00:00")
    return datetime.fromisoformat(s2).astimezone(timezone.utc)


def _clamp_preset(p: str) -> str:
    p2 = (p or "").strip().lower()
    if p2 in ("week", "w"):
        return "Week"
    if p2 in ("month", "m"):
        return "Month"
    if p2 in ("year", "y"):
        return "Year"
    return "Week"


def _preset_window(preset: str) -> Tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    if preset == "Month":
        return (now - timedelta(days=30), now)
    if preset == "Year":
        return (now - timedelta(days=365), now)
    return (now - timedelta(days=7), now)


def _as_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except Exception:
        return default


def _fifo_realized_trades_from_fills(
    fills: List[Dict[str, Any]],
    slippage_bps: float = 0.0,
    fee_bps: float = 0.0,
) -> List[Dict[str, Any]]:
    """
    Convert fills into realized 'trade' records using FIFO matching.
    Phase 1: good enough to power performance charts / expectancy.
    """
    rows = sorted(fills, key=lambda f: (f.get("transaction_time") or f.get("t") or ""))

    lots: Dict[str, List[Dict[str, Any]]] = {}
    trades_out: List[Dict[str, Any]] = []

    for f in rows:
        symbol = str(f.get("symbol") or "").upper().strip()
        side = str(f.get("side") or "").lower().strip()
        qty = _as_float(f.get("qty") or f.get("cum_qty") or f.get("filled_qty") or 0.0)
        price = _as_float(f.get("price") or 0.0)
        t_raw = f.get("transaction_time") or f.get("t") or f.get("timestamp") or None

        if not symbol or qty <= 0 or price <= 0 or not t_raw:
            continue

        t = _parse_dt(str(t_raw))

        if side == "buy":
            lots.setdefault(symbol, []).append({"qty": qty, "price": price, "openedAt": _iso(t)})
            continue

        if side != "sell":
            continue

        remaining = qty
        symbol_lots = lots.get(symbol, [])
        if not symbol_lots:
            continue

        while remaining > 0 and symbol_lots:
            lot = symbol_lots[0]
            take = min(remaining, float(lot["qty"]))

            buy_price = float(lot["price"])
            sell_price = price

            gross_pnl = (sell_price - buy_price) * take

            buy_notional = take * buy_price
            sell_notional = take * sell_price
            cost = (slippage_bps / 10000.0) * (buy_notional + sell_notional) + (fee_bps / 10000.0) * sell_notional

            net_pnl = gross_pnl - cost

            trades_out.append(
                {
                    "symbol": symbol,
                    "pnl": net_pnl,
                    "strategy": "unknown",
                    "openedAt": lot["openedAt"],
                    "closedAt": _iso(t),
                    "exitReason": "unknown",
                }
            )

            lot["qty"] = float(lot["qty"]) - take
            remaining -= take

            if lot["qty"] <= 1e-9:
                symbol_lots.pop(0)

        lots[symbol] = symbol_lots

    return trades_out


@router.get("/orders")
def list_orders(
    request: Request,
    response: Response,
    status: str = "all",
    limit: int = 200,
    direction: str = "desc",
    after: Optional[str] = None,
    until: Optional[str] = None,
):
    try:
        user = require_user(request, response)
        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user["id"])

        limit = max(1, min(int(limit), 500))
        base = _trading_base_url(mode)
        url = f"{base}/v2/orders"
        params: Dict[str, Any] = {"status": status, "limit": limit, "direction": direction}
        if after:
            params["after"] = after
        if until:
            params["until"] = until

        r = requests.get(url, params=params, headers=_alpaca_headers(api_key, api_secret), timeout=12)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"alpaca_orders_error {r.status_code}: {r.text}")

        return {"ok": True, "mode": mode, "orders": r.json()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"alpaca_orders_failed: {repr(e)}")


@router.get("/fills")
def list_fills(
    request: Request,
    response: Response,
    activity_types: str = "FILL",
    direction: str = "desc",
    page_size: int = 200,
    after: Optional[str] = None,
    until: Optional[str] = None,
):
    try:
        user = require_user(request, response)
        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user["id"])

        page_size = max(1, min(int(page_size), 500))
        base = _trading_base_url(mode)
        url = f"{base}/v2/account/activities"
        params: Dict[str, Any] = {
            "activity_types": activity_types,
            "direction": direction,
            "page_size": page_size,
        }
        if after:
            params["after"] = after
        if until:
            params["until"] = until

        r = requests.get(url, params=params, headers=_alpaca_headers(api_key, api_secret), timeout=12)
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"alpaca_fills_error {r.status_code}: {r.text}")

        return {"ok": True, "mode": mode, "fills": r.json()}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"alpaca_fills_failed: {repr(e)}")


@router.get("/summary")
def trade_summary(
    request: Request,
    response: Response,
    preset: str = "Week",
    slippage_bps: float = 0.0,
    fee_bps: float = 0.0,
):
    try:
        user = require_user(request, response)
        sb = get_supabase_service()
        api_key, api_secret, mode = _load_alpaca_keys(sb, user["id"])

        preset_norm = _clamp_preset(preset)
        start_dt, end_dt = _preset_window(preset_norm)

        base = _trading_base_url(mode)
        url = f"{base}/v2/account/activities"
        params: Dict[str, Any] = {
            "activity_types": "FILL",
            "direction": "asc",
            "page_size": 100,
            "after": _iso(start_dt),
            "until": _iso(end_dt),
        }

        r = requests.get(url, params=params, headers=_alpaca_headers(api_key, api_secret), timeout=12)
        if r.status_code in (401, 403):
            raise HTTPException(status_code=401, detail=f"alpaca_summary_fills_error {r.status_code}: {r.text}")
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"alpaca_summary_fills_error {r.status_code}: {r.text}")


        fills = r.json() or []
        trades = _fifo_realized_trades_from_fills(
            fills=fills,
            slippage_bps=float(slippage_bps or 0.0),
            fee_bps=float(fee_bps or 0.0),
        )

        return {
            "ok": True,
            "mode": mode,
            "preset": preset_norm,
            "start": start_dt.strftime("%b %-d, %Y") if os.name != "nt" else start_dt.strftime("%b %d, %Y"),
            "end": end_dt.strftime("%b %-d, %Y") if os.name != "nt" else end_dt.strftime("%b %d, %Y"),
            "trades": trades,
            "meta": {
                "fills_count": len(fills),
                "trades_count": len(trades),
                "slippage_bps": slippage_bps,
                "fee_bps": fee_bps,
                "fetchedAt": _iso(datetime.now(timezone.utc)),
                "source": "alpaca_trading_api",
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"alpaca_trade_summary_failed: {repr(e)}")
