# api/routes/fx.py
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/market/fx", tags=["market-fx"])

@router.get("/quote")
def fx_quote(symbol: str):
    """
    Local-only MT5 quote.
    In production/serverless environments MT5 won't exist, so we fail gracefully.
    """
    try:
        import MetaTrader5 as mt5
    except Exception:
        raise HTTPException(status_code=501, detail="MT5 is not available on this server. FX requires a local runner/VPS.")

    if not mt5.initialize():
        raise HTTPException(status_code=500, detail=f"MT5 initialize failed: {mt5.last_error()}")

    sym = (symbol or "").strip()
    tick = mt5.symbol_info_tick(sym)
    if tick is None:
        raise HTTPException(status_code=400, detail=f"Symbol not available in MT5: {sym}")

    bid = float(tick.bid)
    ask = float(tick.ask)
    return {"ok": True, "symbol": sym, "bid": bid, "ask": ask, "spread": ask - bid, "time_msc": int(tick.time_msc)}
