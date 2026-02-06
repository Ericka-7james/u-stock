# backend/api/routes/integrations_alpaca.py
from __future__ import annotations

from typing import Optional, Literal, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from api.deps import require_user
from api.security.bot_runner_dep import require_bot_runner
from api.db import get_supabase_service
from api.core.crypto import encrypt_secret, decrypt_secret

router = APIRouter(prefix="/integrations/alpaca", tags=["integrations-alpaca"])


# -------------------------
# Models (keep simple + test-friendly)
# -------------------------
class AlpacaKeysIn(BaseModel):
    api_key: str = Field(..., min_length=5)
    api_secret: str = Field(..., min_length=5)
    mode: Literal["paper", "live"]


class AlpacaKeysOut(BaseModel):
    ok: bool
    provider: str
    status: str
    mode: str


class AlpacaCredsOut(BaseModel):
    ok: bool
    provider: str
    status: str
    mode: str
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


def _normalize_mode(m: str) -> str:
    m2 = (m or "paper").strip().lower()
    return "live" if m2 == "live" else "paper"


def _http_err(status_code: int, code: str, message: str, extra: Optional[Dict[str, Any]] = None) -> HTTPException:
    detail: Dict[str, Any] = {"code": code, "message": message, "provider": "alpaca"}
    if extra:
        detail.update(extra)
    return HTTPException(status_code=status_code, detail=detail)


@router.post("/keys", response_model=AlpacaKeysOut)
def save_alpaca_keys(body: AlpacaKeysIn, request: Request, response: Response):
    u = require_user(request, response)
    user_id = u["id"]

    api_key = (body.api_key or "").strip()
    api_secret = (body.api_secret or "").strip()
    mode = _normalize_mode(body.mode)

    if not api_key or not api_secret:
        raise _http_err(
            400,
            "ALPACA_KEYS_MISSING",
            "API key/secret missing after trimming whitespace",
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

    # Preferred path: upsert
    try:
        sb.table("integrations").upsert(payload, on_conflict="user_id,provider").execute()
        return AlpacaKeysOut(ok=True, provider="alpaca", status="connected", mode=mode)
    except Exception:
        # fallback path used by tests:
        # if row exists -> update; else -> insert
        try:
            existing = (
                sb.table("integrations")
                .select("user_id")
                .eq("user_id", user_id)
                .eq("provider", "alpaca")
                .maybe_single()
                .execute()
            ).data
        except Exception as e:
            raise _http_err(
                500,
                "INTEGRATION_CHECK_FAILED",
                "Failed to check existing integration",
                {"error": repr(e)},
            )

        try:
            if existing:
                sb.table("integrations").update(payload).eq("user_id", user_id).eq("provider", "alpaca").execute()
            else:
                sb.table("integrations").insert(payload).execute()
        except Exception as e:
            raise _http_err(
                500,
                "INTEGRATION_SAVE_FAILED",
                "Failed to save Alpaca keys",
                {"error": repr(e)},
            )

        return AlpacaKeysOut(ok=True, provider="alpaca", status="connected", mode=mode)


@router.get("/creds", response_model=AlpacaCredsOut)
def get_alpaca_creds(user_id: str = Depends(require_bot_runner)):
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
        # ✅ structured detail (tests expect dict)
        raise _http_err(
            500,
            "INTEGRATION_LOAD_FAILED",
            "Failed to load Alpaca integration",
            {"error": repr(e)},
        )

    rows = res.data or []
    row = rows[0] if rows else None

    if not row:
        return AlpacaCredsOut(ok=True, provider="alpaca", status="not_connected", mode="paper", api_key=None, api_secret=None)

    status = str(row.get("status") or "").strip().lower()
    mode = _normalize_mode(str(row.get("mode") or "paper"))

    if status != "connected":
        return AlpacaCredsOut(ok=True, provider="alpaca", status="not_connected", mode=mode, api_key=None, api_secret=None)

    # only decrypt when connected
    api_key = decrypt_secret(row.get("api_key_enc"))
    api_secret = decrypt_secret(row.get("api_secret_enc"))

    return AlpacaCredsOut(ok=True, provider="alpaca", status="connected", mode=mode, api_key=api_key, api_secret=api_secret)
