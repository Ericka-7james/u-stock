# api/alpaca_auth.py
from __future__ import annotations

import os
from typing import Tuple

from fastapi import HTTPException

from api.db import get_supabase_service
from api.crypto_utils import decrypt_secret


def _site_alpaca_creds_from_env() -> Tuple[str, str, str] | None:
    """
    Returns (key, secret, mode) if site-owned credentials exist; otherwise None.
    Read env at call-time (NOT import-time) for correctness + testability.
    """
    key = os.getenv("ALPACA_API_KEY", "").strip()
    secret = os.getenv("ALPACA_API_SECRET", "").strip()
    mode = os.getenv("ALPACA_MODE", "paper").strip().lower()

    if not key or not secret:
        return None

    if mode not in ("paper", "live"):
        mode = "paper"

    return key, secret, mode


def get_alpaca_credentials(user_id: str | None) -> Tuple[str, str, str]:
    """
    Returns (api_key, api_secret, mode)

    Priority:
      1) Site-owned env keys (if set)
      2) User saved keys from integrations table
    """
    # 1) Site-owned (env)
    site = _site_alpaca_creds_from_env()
    if site:
        return site

    # 2) User-owned (Supabase)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    sb = get_supabase_service()
    try:
        res = (
            sb.table("integrations")
            .select("status, api_key_enc, api_secret_enc, mode")
            .eq("user_id", user_id)
            .eq("provider", "alpaca")
            .limit(1)
            .execute()
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load Alpaca integration: {repr(e)}")

    rec = (res.data or [None])[0]
    if not rec or str(rec.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not connected.")

    api_key = decrypt_secret(rec.get("api_key_enc"))
    api_secret = decrypt_secret(rec.get("api_secret_enc"))
    mode = str(rec.get("mode") or "paper").strip().lower()

    if not api_key or not api_secret:
        raise HTTPException(status_code=500, detail="Stored Alpaca keys missing or not decryptable.")
    if mode not in ("paper", "live"):
        mode = "paper"

    return api_key, api_secret, mode


def alpaca_headers(api_key: str, api_secret: str) -> dict:
    return {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": api_secret,
    }
