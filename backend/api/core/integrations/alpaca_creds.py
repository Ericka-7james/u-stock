# api/core/integrations/alpaca_creds.py
from __future__ import annotations

from typing import Tuple

from fastapi import HTTPException, Request, Response

from api.deps import require_user
from api.db import get_supabase_service
from api.core.security import decrypt_secret


def _load_alpaca_row_for_user(user_id: str) -> dict:
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

    return row


def _normalize_keys(row: dict) -> Tuple[str, str, str]:
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

    return api_key, api_secret, mode


def get_user_alpaca_creds(request: Request, response: Response) -> Tuple[str, str, str, str]:
    """
    Cookie-auth path (UI):
    Returns: (user_id, api_key, api_secret, mode)
    """
    user = require_user(request, response)
    user_id = user["id"]

    row = _load_alpaca_row_for_user(user_id)
    api_key, api_secret, mode = _normalize_keys(row)
    return user_id, api_key, api_secret, mode


def get_user_alpaca_creds_by_user_id(user_id: str) -> Tuple[str, str, str]:
    """
    Runner-auth path (bots):
    Returns: (api_key, api_secret, mode)
    """
    uid = str(user_id or "").strip()
    if not uid:
        raise HTTPException(status_code=401, detail="Missing user_id")

    row = _load_alpaca_row_for_user(uid)
    api_key, api_secret, mode = _normalize_keys(row)
    return api_key, api_secret, mode
