# api/routes/fundamentals.py
from fastapi import APIRouter, HTTPException

# IMPORTANT:
# This file is inside api/routes, so ".clients" would mean api/routes/clients (wrong).
# Use api.clients... or ..clients...
from api.clients.fundamentals_client import alpha_company_overview

router = APIRouter(prefix="/api/fundamentals", tags=["fundamentals"])


@router.get("/overview")
def overview(symbol: str):
    try:
        symbol = (symbol or "").upper().strip()
        if not symbol:
            raise ValueError("symbol is required")

        return {"ok": True, "symbol": symbol, **alpha_company_overview(symbol)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"fundamentals_failed: {repr(e)}")
