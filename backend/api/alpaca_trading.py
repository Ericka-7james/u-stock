# api/alpaca_trading.py
from __future__ import annotations

import requests
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Tuple

from fastapi import APIRouter, HTTPException, Request, Response

from .core.security import require_user, decrypt_secret, get_supabase_service

router = APIRouter(prefix="/alpaca/trading", tags=["alpaca-trading"])

_REQUEST_TIMEOUT_SECONDS = 12


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
            detail={
                "code": "ALPACA_NOT_CONNECTED",
                "message": "Alpaca not connected for this user",
                "hint": "Connect Alpaca in Connected Apps.",
            },
        )

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ALPACA_NOT_CONNECTED",
                "message": "Alpaca is not marked connected",
                "hint": "Reconnect Alpaca in Connected Apps.",
            },
        )

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = str(row.get("mode") or "paper").lower().strip()
    if mode not in ("paper", "live"):
        mode = "paper"

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "ALPACA_KEYS_MISSING",
                "message": "Alpaca keys missing or unreadable",
                "hint": "Reconnect Alpaca in Connected Apps.",
            },
        )

    return api_key, api_secret, mode


def _alpaca_headers(api_key: str, api_secret: str) -> Dict[str, str]:
    return {"APCA-API-KEY-ID": api_key, "APCA-API-SECRET-KEY": api_secret}


def _trading_base_url(mode: str) -> str:
    return "https://paper-api.alpaca.markets" if mode == "paper" else "https://api.alpaca.markets"


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _format_day(dt: datetime) -> str:
    """
    Windows-safe formatter (avoids %-d).
    Example: Jan 3, 2026
    """
    dt = dt.astimezone(timezone.utc)
    return f"{dt.strftime('%b')} {dt.day}, {dt.year}"


def _parse_dt(s: str) -> datetime | None:
    """
    Returns UTC datetime or None if parsing fails.
    """
    try:
        s2 = (s or "").replace("Z", "+00:00")
        return datetime.fromisoformat(s2).astimezone(timezone.utc)
    except Exception:
        return None


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


def _safe_get(url: str, params: Dict[str, Any], headers: Dict[str, str]) -> requests.Response:
    try:
        return requests.get(url, params=params, headers=headers, timeout=_REQUEST_TIMEOUT_SECONDS)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail={"code": "NETWORK_ERROR", "message": "Request failed", "raw": repr(e)})


def _fifo_realized_trades_from_fills(
    fills: List[Dict[str, Any]],
    slippage_bps: float = 0.0,
    fee_bps: float = 0.0,
) -> List[Dict[str, Any]]:
    rows = sorted(fills or [], key=lambda f: (f.get("transaction_time") or f.get("t") or f.get("timestamp") or ""))

    lots: Dict[str, List[Dict[str, Any]]] = {}
    trades_out: List[Dict[str, Any]] = []

    for f in rows:
        if not isinstance(f, dict):
            continue

        symbol = str(f.get("symbol") or "").upper().strip()
        side = str(f.get("side") or "").lower().strip()
        qty = _as_float(f.get("qty") or f.get("cum_qty") or f.get("filled_qty") or 0.0)
        price = _as_float(f.get("price") or 0.0)
        t_raw = f.get("transaction_time") or f.get("t") or f.get("timestamp") or None

        if not symbol or qty <= 0 or price <= 0 or not t_raw:
            continue

        t = _parse_dt(str(t_raw))
        if t is None:
            continue

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

        r = _safe_get(url, params=params, headers=_alpaca_headers(api_key, api_secret))

        if r.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail={
                    "code": "ALPACA_INVALID_KEY",
                    "message": "Alpaca rejected the API key/secret.",
                    "hint": "Reconnect Alpaca in Connected Apps.",
                },
            )
        if r.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail={
                    "code": "ALPACA_TRADING_API_ERROR",
                    "message": "Alpaca trading API error.",
                    "hint": "Retry, then reconnect Alpaca if it persists.",
                    "raw": (r.text or "")[:300],
                },
            )

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
            "start": _format_day(start_dt),
            "end": _format_day(end_dt),
            "trades": trades,
            "meta": {
                "fills_count": len(fills) if isinstance(fills, list) else 0,
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
        raise HTTPException(
            status_code=500,
            detail={
                "code": "TRADE_SUMMARY_FAILED",
                "message": "Trade summary failed",
                "hint": "Check backend logs",
                "raw": repr(e),
            },
        )
