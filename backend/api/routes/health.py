# backend/api/routes/health.py
from __future__ import annotations

import os
from fastapi import APIRouter, HTTPException

from api.db import get_supabase_anon

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def healthcheck():
    """
    Lightweight health check:
    - Env vars loaded
    - Supabase client can initialize
    - Simple DB call succeeds
    """

    # --- Env sanity checks (fail fast) ---
    required_env = [
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
    ]

    missing = [k for k in required_env if not os.getenv(k)]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Missing env vars: {', '.join(missing)}",
        )

    # --- Supabase connectivity check ---
    try:
        sb = get_supabase_anon()

        # extremely cheap query (does NOT depend on your tables)
        # auth.get_user() is safe and fast
        sb.auth.get_user()

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Supabase check failed: {str(e)}",
        )

    return {
        "status": "ok",
        "env": os.getenv("ENV", "local"),
    }
