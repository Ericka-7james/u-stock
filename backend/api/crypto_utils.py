# api/crypto_utils.py
from __future__ import annotations

import os
from cryptography.fernet import Fernet
from fastapi import HTTPException


def _get_key() -> str:
    """
    Read the encryption key at runtime (NOT import time).
    This prevents "env loaded after import" issues during local dev.
    """
    return os.getenv("INTEGRATIONS_ENC_KEY", "").strip()


def _fernet() -> Fernet:
    key = _get_key()
    if not key:
        raise HTTPException(
            status_code=500,
            detail="INTEGRATIONS_ENC_KEY is missing (backend env not loaded).",
        )

    try:
        # Fernet requires base64 urlsafe 32-byte key (44 chars)
        return Fernet(key.encode("utf-8"))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"INTEGRATIONS_ENC_KEY is invalid. Regenerate a Fernet key. ({type(e).__name__})",
        )


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None
    f = _fernet()
    return f.encrypt(v.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str | None) -> str | None:
    if token is None:
        return None
    t = str(token).strip()
    if not t:
        return None
    f = _fernet()
    return f.decrypt(t.encode("utf-8")).decode("utf-8")
