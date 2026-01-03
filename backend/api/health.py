# api/health.py
from __future__ import annotations

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/health", tags=["health"])

def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]

@router.get("/market-snapshot")
def market_snapshot_health():
    path = _project_root() / "public" / "data" / "fetched" / "market-snapshot-health.json"
    if not path.exists():
        # Not an error: just means it hasn't run yet.
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "status": "missing",
                "error": "health file not found yet",
                "path": str(path),
            },
        )

    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read health file: {repr(e)}")
