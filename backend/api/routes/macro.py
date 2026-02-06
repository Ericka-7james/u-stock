# backend/api/routes/macro.py
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel, Field

from api.clients.fred_client import get_macro_summary

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/macro", tags=["macro"])


# -------------------------
# Helpers
# -------------------------
def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(v)))


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
    return _clamp_int(ttl, 60, 3600)


def _set_cache_headers(response: Response, ttl: int, *, private: bool = False) -> None:
    # Public is fine if no user-specific data is returned
    scope = "private" if private else "public"
    response.headers["Cache-Control"] = f"{scope}, max-age={ttl}"
    response.headers["Vary"] = "Accept-Encoding"


# -------------------------
# Models
# -------------------------
class MacroSummaryOut(BaseModel):
    ok: bool = True
    as_of: int = Field(..., description="Unix seconds when this payload was generated")
    source: str = "fred"
    ttl_seconds: int

    # payload is intentionally flexible: you may add indicators over time
    data: Dict[str, Any] = Field(default_factory=dict)


# -------------------------
# Endpoints
# -------------------------
@router.get("/summary", response_model=MacroSummaryOut)
def macro_summary(
    response: Response,
    ttl_seconds: Optional[int] = Query(
        default=None,
        ge=60,
        le=3600,
        description="Override cache TTL (seconds). If omitted, uses MACRO_TTL_SECONDS.",
    ),
) -> Dict[str, Any]:
    """
    Macro summary intended for:
      - UI display (Macro card)
      - Bot context (risk throttles / regime filters)
    """
    ttl = _clamp_int(ttl_seconds if ttl_seconds is not None else _get_ttl_seconds(), 60, 3600)
    _set_cache_headers(response, ttl)

    try:
        # fred_client should handle its own caching + upstream calls.
        payload = get_macro_summary(ttl_seconds=ttl) or {}

        # Normalize envelope so UI/bots can rely on stable keys
        return {
            "ok": True,
            "as_of": int(time.time()),
            "source": "fred",
            "ttl_seconds": ttl,
            "data": payload,
        }

    except HTTPException:
        raise
    except Exception:
        # Don’t leak internal exception content to clients
        log.exception("macro_summary_failed ttl=%s", ttl)
        raise HTTPException(
            status_code=502,
            detail={
                "code": "MACRO_FAILED",
                "message": "Failed to load macro summary",
            },
        )
