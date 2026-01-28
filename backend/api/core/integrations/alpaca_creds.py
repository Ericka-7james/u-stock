from __future__ import annotations

from typing import Tuple

from fastapi import HTTPException, Request, Response

from api.deps import require_user
from api.db import get_supabase_service
from api.core.security import decrypt_secret


def get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Returns: (user_id, api_key, api_secret, mode)

    Reads per-user Alpaca integration from Supabase 'integrations' table.
    Expected columns:
      - provider (alpaca)
      - status (connected)
      - mode (paper|live)
      - api_key_enc
      - api_secret_enc
    """
    user = require_user(request, response)
    user_id = user["id"]

    sb = get_supabase_service()
    try:
        res = (
            sb.table("integrations")
            .select("api_key_enc,api_secret_enc,mode,status")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load integrations: {repr(e)}")

    rows = getattr(res, "data", None) or []
    row = rows[0] if rows else None
    if not row:
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_NOT_CONNECTED", "message": "Alpaca not connected for this user"},
        )

    if str(row.get("status", "")).lower() != "connected":
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_NOT_CONNECTED", "message": "Alpaca is not marked connected"},
        )

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = str(row.get("mode") or "paper").lower()
    if mode not in ("paper", "live"):
        mode = "paper"

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_INVALID_KEY", "message": "Alpaca keys missing or unreadable"},
        )

    return user_id, api_key, api_secret, mode
