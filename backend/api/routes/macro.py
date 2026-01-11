# backend/api/routes/macro.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.clients.fred_client import get_macro_summary

router = APIRouter(prefix="/api/macro", tags=["macro"])


@router.get("/summary")
def macro_summary():
    try:
        return get_macro_summary(ttl_seconds=600)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"macro_failed: {repr(e)}")
