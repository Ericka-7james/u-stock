# backend/api/routes/integrations.py
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response

from api.deps import require_user
from api.db import get_supabase_service

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("")
def list_integrations(request: Request, response: Response):
    """
    GET /api/integrations
    Returns all integrations for the signed-in user (cookie auth).
    """
    u = require_user(request, response)
    user_id = u["id"]

    sb = get_supabase_service()

    try:
        res = (
            sb.table("integrations")
            .select("provider,status,mode,updated_at,created_at")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list integrations: {repr(e)}")

    items = res.data or []

    # Normalize shape a bit for frontend convenience
    out: List[Dict[str, Any]] = []
    for row in items:
        out.append(
            {
                "provider": row.get("provider"),
                "status": row.get("status"),
                "mode": row.get("mode"),
                "updated_at": row.get("updated_at"),
                "created_at": row.get("created_at"),
            }
        )

    return {"ok": True, "items": out}
