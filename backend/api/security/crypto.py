# api/security/crypto.py
from __future__ import annotations

import os
from cryptography.fernet import Fernet
from fastapi import HTTPException


def _fernet() -> Fernet:
    key = os.getenv("INTEGRATIONS_ENC_KEY", "").strip()
    if not key:
        raise HTTPException(status_code=500, detail="INTEGRATIONS_ENC_KEY is missing")
    return Fernet(key.encode("utf-8"))


def encrypt_secret(value: str | None) -> str | None:
    if not value:
        return None
    f = _fernet()
    return f.encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str | None) -> str | None:
    if not token:
        return None
    f = _fernet()
    return f.decrypt(token.encode("utf-8")).decode("utf-8")
