# api/routes/fundamentals.py
from fastapi import APIRouter, HTTPException
from api.clients.fundamentals_client import alpha_company_overview

router = APIRouter(prefix="/api/fundamentals", tags=["fundamentals"])

@router.get("/overview")
def overview(symbol: str):
    try:
        return {"ok": True, "symbol": symbol.upper().strip(), **alpha_company_overview(symbol)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"fundamentals_failed: {repr(e)}")
