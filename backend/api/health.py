# backend/api/routes/health.py
from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api", tags=["health"])


def _backend_root() -> Path:
    # .../backend
    return Path(__file__).resolve().parents[2]


def _snapshot_health_path() -> Path:
    return _backend_root() / "public" / "data" / "fetched" / "market-snapshot-health.json"


@router.get("/health")
def health():
    return {"status": "ok", "env": os.getenv("ENV", "development").strip().lower()}


@router.get("/health/market-snapshot")
def market_snapshot_health():
    path = _snapshot_health_path()

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
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read health file")
