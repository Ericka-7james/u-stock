from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

from api.db import get_supabase_service
from api.crypto_utils import decrypt_secret, encrypt_secret

from api.core.integrations.alpaca_models import normalize_mode


class AlpacaIntegrationRepo:
    """
    Handles DB persistence + encryption for Alpaca integration.
    Keeps routes thin and consistent.
    """

    def __init__(self):
        self.sb = get_supabase_service()

    def upsert_keys(self, *, user_id: str, api_key: str, api_secret: str, mode: str) -> str:
        api_key = (api_key or "").strip()
        api_secret = (api_secret or "").strip()
        mode = normalize_mode(mode)

        if not api_key or not api_secret:
            raise HTTPException(
                status_code=400,
                detail={"code": "ALPACA_KEYS_MISSING", "message": "Alpaca keys missing. Please paste key + secret."},
            )

        payload = {
            "user_id": user_id,
            "provider": "alpaca",
            "status": "connected",
            "mode": mode,
            "api_key_enc": encrypt_secret(api_key),
            "api_secret_enc": encrypt_secret(api_secret),
        }

        # Prefer upsert with on_conflict if constraint exists.
        try:
            self.sb.table("integrations").upsert(payload, on_conflict="user_id,provider").execute()
            return mode
        except Exception as e:
            # Fallback for schemas without (user_id, provider) unique constraint
            try:
                existing = (
                    self.sb.table("integrations")
                    .select("user_id")
                    .eq("user_id", user_id)
                    .eq("provider", "alpaca")
                    .maybe_single()
                    .execute()
                )
                if getattr(existing, "data", None):
                    self.sb.table("integrations").update(payload).eq("user_id", user_id).eq("provider", "alpaca").execute()
                else:
                    self.sb.table("integrations").insert(payload).execute()
                return mode
            except Exception as e2:
                raise HTTPException(status_code=500, detail=f"Failed to save Alpaca integration: {repr(e)} / {repr(e2)}")

    def get_row(self, *, user_id: str) -> Optional[Dict[str, Any]]:
        try:
            res = (
                self.sb.table("integrations")
                .select("status,mode,api_key_enc,api_secret_enc")
                .eq("user_id", user_id)
                .eq("provider", "alpaca")
                .limit(1)
                .execute()
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load Alpaca integration: {repr(e)}")

        rows = getattr(res, "data", None) or []
        return rows[0] if rows else None

    def get_creds_if_connected(self, *, user_id: str) -> Tuple[str, str, Optional[str], Optional[str]]:
        """
        Returns: (status, mode, api_key, api_secret)
        Secrets are returned only if status == connected.
        """
        row = self.get_row(user_id=user_id)
        if not row:
            return "not_connected", "paper", None, None

        status = str(row.get("status") or "not_connected").lower()
        mode = normalize_mode(str(row.get("mode") or "paper"))

        if status != "connected":
            return "not_connected", mode, None, None

        api_key = decrypt_secret(row.get("api_key_enc"))
        api_secret = decrypt_secret(row.get("api_secret_enc"))
        return "connected", mode, api_key, api_secret

    def disconnect(self, *, user_id: str) -> None:
        """
        Mark integration disconnected and clear encrypted secrets.
        Safe to call even if row doesn't exist.
        """
        payload = {
            "status": "disconnected",
            "mode": "paper",
            "api_key_enc": None,
            "api_secret_enc": None,
        }

        try:
            # If you have unique constraint, this ensures the row exists and is cleared.
            self.sb.table("integrations").upsert(
                {"user_id": user_id, "provider": "alpaca", **payload},
                on_conflict="user_id,provider",
            ).execute()
            return
        except Exception:
            # Fallback: update if exists; otherwise insert.
            try:
                existing = (
                    self.sb.table("integrations")
                    .select("user_id")
                    .eq("user_id", user_id)
                    .eq("provider", "alpaca")
                    .maybe_single()
                    .execute()
                )
                if getattr(existing, "data", None):
                    self.sb.table("integrations").update(payload).eq("user_id", user_id).eq("provider", "alpaca").execute()
                else:
                    self.sb.table("integrations").insert({"user_id": user_id, "provider": "alpaca", **payload}).execute()
            except Exception as e2:
                raise HTTPException(status_code=500, detail=f"Failed to disconnect Alpaca integration: {repr(e2)}")
