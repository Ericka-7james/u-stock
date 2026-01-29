# api/routes/fx.py
from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.security.bot_runner_dep import require_bot_runner

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/market/fx", tags=["market-fx"])

# Keep this endpoint runner-only (MT5 is local/VPS).
# If you want user-cookie access later, add a separate route that proxies via runner.


# -------------------------
# Models
# -------------------------
class FXQuoteOut(BaseModel):
    ok: bool = True
    symbol: str
    bid: float
    ask: float
    spread: float
    time_msc: int
    source: str = "mt5"
    meta: Dict[str, Any] = Field(default_factory=dict)


# -------------------------
# Helpers
# -------------------------
def _clean_fx_symbol(symbol: str) -> str:
    s = (symbol or "").strip()
    # Allow typical MT5/FX formats: "EURUSD", "EURUSDm", "XAUUSD", "US30", etc.
    # Don’t over-restrict; just ensure it’s not insane.
    if not s or len(s) > 32:
        return ""
    # Avoid weird whitespace/control characters
    if any(ord(ch) < 32 for ch in s):
        return ""
    return s


def _mt5_quote(sym: str) -> Dict[str, Any]:
    """
    Returns dict containing bid/ask/time_msc.
    Raises HTTPException on any MT5 errors.
    """
    try:
        import MetaTrader5 as mt5  # type: ignore
    except Exception:
        raise HTTPException(
            status_code=501,
            detail="MT5 is not available on this server. FX requires a local runner/VPS.",
        )

    initialized = False
    try:
        if not mt5.initialize():
            raise HTTPException(status_code=500, detail=f"MT5 initialize failed: {mt5.last_error()}")

        initialized = True

        # Ensure symbol selected/visible in Market Watch if supported
        try:
            info = mt5.symbol_info(sym)
            if info is None:
                raise HTTPException(status_code=400, detail=f"Symbol not available in MT5: {sym}")
            if not info.visible:
                mt5.symbol_select(sym, True)
        except HTTPException:
            raise
        except Exception:
            # If symbol_info isn't reliable, proceed and let tick fetch fail loudly.
            pass

        tick = mt5.symbol_info_tick(sym)
        if tick is None:
            raise HTTPException(status_code=400, detail=f"Symbol not available in MT5: {sym}")

        bid = float(getattr(tick, "bid", 0.0))
        ask = float(getattr(tick, "ask", 0.0))
        time_msc = int(getattr(tick, "time_msc", 0))

        if bid <= 0 or ask <= 0:
            raise HTTPException(status_code=502, detail="MT5 returned invalid bid/ask")

        return {"bid": bid, "ask": ask, "time_msc": time_msc}

    finally:
        # Best-effort cleanup (some MT5 builds expose shutdown)
        try:
            if initialized and hasattr(mt5, "shutdown"):
                mt5.shutdown()
        except Exception:
            pass


# -------------------------
# Endpoints
# -------------------------
@router.get("/quote", response_model=FXQuoteOut)
def fx_quote(
    symbol: str = Query(..., min_length=1, description="MT5 FX symbol (e.g., EURUSD, XAUUSD)"),
    runner_user_id: str = Depends(require_bot_runner),
):
    """
    Runner-only MT5 quote.

    Why runner-only:
      - MT5 is installed on a local machine/VPS (not serverless)
      - Keeping it runner-authenticated prevents exposing local infrastructure to the public internet
    """
    sym = _clean_fx_symbol(symbol)
    if not sym:
        raise HTTPException(status_code=400, detail="Symbol is required")

    try:
        q = _mt5_quote(sym)
        bid = float(q["bid"])
        ask = float(q["ask"])
        return {
            "ok": True,
            "symbol": sym,
            "bid": bid,
            "ask": ask,
            "spread": ask - bid,
            "time_msc": int(q["time_msc"]),
            "source": "mt5",
            "meta": {"runner_user_id": runner_user_id},
        }
    except HTTPException:
        raise
    except Exception:
        log.exception("mt5_quote_failed symbol=%s runner_user_id=%s", sym, runner_user_id)
        raise HTTPException(status_code=500, detail="mt5_quote_failed")
