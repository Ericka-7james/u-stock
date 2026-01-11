# api/routes/fundamentals.py
from fastapi import APIRouter, HTTPException

from api.clients.fundamentals_client import alpha_company_overview

router = APIRouter(prefix="/api/fundamentals", tags=["fundamentals"])


@router.get("/overview")
def overview(symbol: str):
    symbol = (symbol or "").upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    try:
        return {"ok": True, "symbol": symbol, **alpha_company_overview(symbol)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"fundamentals_failed: {repr(e)}")
