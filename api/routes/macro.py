# api/routes/macro.py
from fastapi import APIRouter, HTTPException
from api.clients.fred_client import fred_series_observations

router = APIRouter(prefix="/api/macro", tags=["macro"])

@router.get("/fred/series")
def fred_series(series_id: str):
    try:
        return {"ok": True, "series_id": series_id, **fred_series_observations(series_id)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"fred_failed: {repr(e)}")
