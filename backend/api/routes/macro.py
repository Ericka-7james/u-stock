# backend/api/routes/macro.py
from __future__ import annotations

import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Response

from api.clients.fred_client import get_macro_summary

router = APIRouter(prefix="/api/macro", tags=["macro"])


def _get_ttl_seconds() -> int:
    """
    TTL for macro summary caching.
    Defaults to 600s; clamps to a safe range to prevent misconfig (too low = spam upstream,
    too high = stale data).
    """
    raw = os.getenv("MACRO_TTL_SECONDS", "600")
    try:
        ttl = int(raw)
    except Exception:
        ttl = 600

    # clamp: 60s..3600s
    if ttl < 60:
        ttl = 60
    if ttl > 3600:
        ttl = 3600
    return ttl


@router.get("/summary")
def macro_summary(response: Response) -> Dict[str, Any]:
    ttl = _get_ttl_seconds()

    # Let caches know this is safe to reuse for a short period
    response.headers["Cache-Control"] = f"public, max-age={ttl}"

    try:
        # fred_client is responsible for its own internal caching + upstream calls
        return get_macro_summary(ttl_seconds=ttl)
    except Exception as e:
        # 502: upstream dependency error (FRED/client layer)
        # Use structured detail so UI can handle reliably.
        raise HTTPException(
            status_code=502,
            detail={
                "code": "MACRO_FAILED",
                "message": "Failed to load macro summary",
                "detail": repr(e),
            },
        )
