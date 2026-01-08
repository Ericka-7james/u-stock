# api/routes/integrations_alpaca.py
from __future__ import annotations

from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.db import get_supabase_service
from api.crypto_utils import decrypt_secret
from api.security.bot_runner_dep import require_bot_runner

router = APIRouter(prefix="/integrations/alpaca", tags=["integrations-alpaca"])


class AlpacaCredsOut(BaseModel):
    ok: bool = True
    provider: str = "alpaca"
    status: str
    mode: Optional[str] = "paper"
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


@router.get("/creds", response_model=AlpacaCredsOut)
def get_alpaca_creds(user_id: str = Depends(require_bot_runner)):
    """
    Bot runner uses this to fetch Alpaca keys tied to the logged-in user (via bot-runner token).
    """
    sb = get_supabase_service()

    try:
        res = (
            sb.table("integrations")
            .select("status,mode,api_key_enc,api_secret_enc")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load Alpaca integration: {repr(e)}")

    row: Dict[str, Any] | None = (res.data[0] if res.data else None)
    if not row:
        return AlpacaCredsOut(ok=True, status="not_connected", mode="paper", api_key=None, api_secret=None)

    status = str(row.get("status") or "not_connected").lower()
    mode = str(row.get("mode") or "paper").lower()

    # Only return secrets if connected
    if status != "connected":
        return AlpacaCredsOut(ok=True, status="not_connected", mode=mode, api_key=None, api_secret=None)

    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))

    return AlpacaCredsOut(ok=True, status="connected", mode=mode, api_key=api_key, api_secret=api_secret)
