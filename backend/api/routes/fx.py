# api/routes/fx.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/market/fx", tags=["market-fx"])


@router.get("/quote")
def fx_quote(symbol: str = Query(..., min_length=1)):
    """
    Local-only MT5 quote.

    In production/serverless environments MT5 won't exist, so we fail gracefully.
    This endpoint is intended for local runner / VPS usage only.
    """
    try:
        import MetaTrader5 as mt5
    except Exception:
        raise HTTPException(
            status_code=501,
            detail="MT5 is not available on this server. FX requires a local runner/VPS.",
        )

    sym = (symbol or "").strip()
    if not sym:
        raise HTTPException(status_code=400, detail="Symbol is required")

    try:
        if not mt5.initialize():
            raise HTTPException(status_code=500, detail=f"MT5 initialize failed: {mt5.last_error()}")

        tick = mt5.symbol_info_tick(sym)
        if tick is None:
            raise HTTPException(status_code=400, detail=f"Symbol not available in MT5: {sym}")

        bid = float(tick.bid)
        ask = float(tick.ask)
        return {
            "ok": True,
            "symbol": sym,
            "bid": bid,
            "ask": ask,
            "spread": ask - bid,
            "time_msc": int(tick.time_msc),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"MT5 quote failed: {repr(e)}")
    finally:
        # Best-effort cleanup (some MT5 builds expose shutdown)
        try:
            if hasattr(mt5, "shutdown"):
                mt5.shutdown()
        except Exception:
            pass
