# api/lib/alpaca_user_creds.py
from typing import Tuple
from fastapi import HTTPException, Request, Response
from supabase import Client

from api.index import require_user, decrypt_secret  # If this causes circular import, see note below.

def get_user_alpaca_creds(request: Request, response: Response, sb_service: Client) -> Tuple[str, str, str]:
    """
    Returns (api_key, api_secret, mode) for the signed-in user.
    Reads from Supabase integrations table: api_key_enc, api_secret_enc, mode, status.
    """
    u = require_user(request, response)
    user_id = u["id"]

    try:
        rec = (
            sb_service.table("integrations")
            .select("status, api_key_enc, api_secret_enc, mode")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .maybe_single()
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load Alpaca integration: {repr(e)}")

    row = rec.data
    if not row or str(row.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not connected. Go to Connected Apps and connect Alpaca.")

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))
    mode = (row.get("mode") or "paper").lower()

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Alpaca keys missing. Please reconnect Alpaca.")

    if mode not in ("paper", "live"):
        mode = "paper"

    return api_key, api_secret, mode
