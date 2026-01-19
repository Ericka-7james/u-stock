# backend/api/routes/integrations_alpaca.py
from __future__ import annotations

from typing import Optional, Dict, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from api.db import get_supabase_service
from api.crypto_utils import decrypt_secret, encrypt_secret
from api.security.bot_runner_dep import require_bot_runner
from api.deps import require_user

router = APIRouter(prefix="/integrations/alpaca", tags=["integrations-alpaca"])


# -------------------------
# Models
# -------------------------
class AlpacaCredsOut(BaseModel):
    ok: bool = True
    provider: str = "alpaca"
    status: str
    mode: Optional[str] = "paper"
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


class AlpacaKeysIn(BaseModel):
    api_key: str = Field(..., min_length=5)
    api_secret: str = Field(..., min_length=5)
    mode: Optional[Literal["paper", "live"]] = "paper"


class AlpacaKeysOut(BaseModel):
    ok: bool = True
    provider: str = "alpaca"
    status: str = "connected"
    mode: str = "paper"


# -------------------------
# UI route: save keys (Connected Apps)
# -------------------------
@router.post("/keys", response_model=AlpacaKeysOut)
def save_alpaca_keys(body: AlpacaKeysIn, request: Request, response: Response):
    """
    UI uses this to save Alpaca keys for the currently signed-in user (cookie auth).
    POST /api/integrations/alpaca/keys
    """
    u = require_user(request, response)
    user_id = u["id"]

    api_key = (body.api_key or "").strip()
    api_secret = (body.api_secret or "").strip()
    mode = (body.mode or "paper").strip().lower()
    if mode not in ("paper", "live"):
        mode = "paper"

    if not api_key or not api_secret:
        raise HTTPException(
            status_code=400,
            detail={"code": "ALPACA_KEYS_MISSING", "message": "Alpaca keys missing. Please paste key + secret."},
        )

    sb = get_supabase_service()

    payload = {
        "user_id": user_id,
        "provider": "alpaca",
        "status": "connected",
        "mode": mode,
        "api_key_enc": encrypt_secret(api_key),
        "api_secret_enc": encrypt_secret(api_secret),
    }

    try:
        # Preferred if you have a unique constraint on (user_id, provider)
        sb.table("integrations").upsert(payload, on_conflict="user_id,provider").execute()
    except Exception as e:
        # Fallback: if on_conflict fails due to schema/constraint mismatch, try manual update/insert
        try:
            existing = (
                sb.table("integrations")
                .select("user_id")
                .eq("user_id", user_id)
                .eq("provider", "alpaca")
                .maybe_single()
                .execute()
            )
            if existing.data:
                sb.table("integrations").update(payload).eq("user_id", user_id).eq("provider", "alpaca").execute()
            else:
                sb.table("integrations").insert(payload).execute()
        except Exception as e2:
            raise HTTPException(status_code=500, detail=f"Failed to save Alpaca integration: {repr(e)} / {repr(e2)}")

    return AlpacaKeysOut(ok=True, provider="alpaca", status="connected", mode=mode)


# -------------------------
# Bot-runner route: fetch keys (runner token auth)
# -------------------------
@router.get("/creds", response_model=AlpacaCredsOut)
def get_alpaca_creds(user_id: str = Depends(require_bot_runner)):
    """
    Bot runner uses this to fetch Alpaca keys tied to the logged-in user (via bot-runner token).
    GET /api/integrations/alpaca/creds
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
