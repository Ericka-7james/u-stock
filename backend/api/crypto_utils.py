# api/crypto_utils.py
from __future__ import annotations

import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException


def _get_integrations_key() -> str:
    """
    Read the encryption key at *call time* (NOT at import time).
    This prevents the classic bug where dotenv loads after this module imports.
    """
    key = os.getenv("INTEGRATIONS_ENC_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=500,
            detail="INTEGRATIONS_ENC_KEY is missing (backend). Set it in backend/.env.local and restart the backend.",
        )
    return key


def _fernet() -> Fernet:
    key = _get_integrations_key()
    try:
        return Fernet(key.encode("utf-8"))
    except Exception as e:
        # Bad key format (not a valid Fernet key)
        raise HTTPException(
            status_code=500,
            detail=f"INTEGRATIONS_ENC_KEY is invalid Fernet key format. Regenerate a Fernet key. ({type(e).__name__})",
        )


def encrypt_secret(value: Optional[str]) -> Optional[str]:
    """
    Encrypts plaintext -> token string.
    Returns None if value is None/empty.
    """
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None

    f = _fernet()
    try:
        return f.encrypt(v.encode("utf-8")).decode("utf-8")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to encrypt secret. ({type(e).__name__})",
        )


def decrypt_secret(token: Optional[str]) -> Optional[str]:
    """
    Decrypts token string -> plaintext.
    Returns None if token is None/empty.
    """
    if token is None:
        return None
    t = str(token).strip()
    if not t:
        return None

    f = _fernet()
    try:
        return f.decrypt(t.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # This is the most common: key changed since it was encrypted, or token corrupted
        raise HTTPException(
            status_code=500,
            detail="Failed to decrypt secret (InvalidToken). Your INTEGRATIONS_ENC_KEY likely changed since the value was stored. Use a stable key.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to decrypt secret. ({type(e).__name__})",
        )
