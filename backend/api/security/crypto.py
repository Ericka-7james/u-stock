# api/security/crypto.py
from __future__ import annotations

import os
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    key = os.getenv("INTEGRATIONS_ENC_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="INTEGRATIONS_ENC_KEY is missing")

    try:
        # Fernet() validates the key format internally; we wrap to provide a clean error.
        return Fernet(key.encode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"INTEGRATIONS_ENC_KEY is invalid: {repr(e)}")


def encrypt_secret(value: str | None) -> str | None:
    if value is None:
        return None
    v = str(value)
    if not v:
        return None

    f = _fernet()
    return f.encrypt(v.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str | None) -> str | None:
    if token is None:
        return None
    t = str(token)
    if not t:
        return None

    f = _fernet()
    try:
        return f.decrypt(t.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # token is present but cannot be decrypted (wrong key / corrupted / not Fernet)
        raise HTTPException(status_code=400, detail="Invalid encrypted secret")
