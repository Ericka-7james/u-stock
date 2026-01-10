from __future__ import annotations

import os
from typing import Tuple
from fastapi import HTTPException

from api.db import get_supabase_service
from api.crypto_utils import decrypt_secret

# Optional "site-owned" keys (mainly for prod)
SITE_ALPACA_KEY = os.getenv("ALPACA_API_KEY", "").strip()
SITE_ALPACA_SECRET = os.getenv("ALPACA_API_SECRET", "").strip()
SITE_ALPACA_MODE = os.getenv("ALPACA_MODE", "paper").strip().lower()  # paper|live

def get_alpaca_credentials(user_id: str | None) -> Tuple[str, str, str]:
    """
    Returns (api_key, api_secret, mode)

    Priority:
      1) Site-owned env keys (if set)
      2) User saved keys from integrations table
    """
    # 1) Site-owned
    if SITE_ALPACA_KEY and SITE_ALPACA_SECRET:
        mode = SITE_ALPACA_MODE if SITE_ALPACA_MODE in ("paper", "live") else "paper"
        return SITE_ALPACA_KEY, SITE_ALPACA_SECRET, mode

    # 2) User-owned
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    sb = get_supabase_service()
    rows = (
        sb.table("integrations")
        .select("status, api_key_enc, api_secret_enc, mode")
        .eq("user_id", user_id)
        .eq("provider", "alpaca")
        .limit(1)
        .execute()
    )
    rec = (rows.data or [None])[0]
    if not rec or str(rec.get("status", "")).lower() != "connected":
        raise HTTPException(status_code=400, detail="Alpaca is not connected.")

    api_key = decrypt_secret(rec.get("api_key_enc"))
    api_secret = decrypt_secret(rec.get("api_secret_enc"))
    mode = (rec.get("mode") or "paper").strip().lower()

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
