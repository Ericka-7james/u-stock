# backend/api/core/crypto.py
from __future__ import annotations

# Re-export crypto helpers from the canonical location.
# This keeps older imports stable: `from api.core.crypto import ...`
from api.security.crypto import decrypt_secret, encrypt_secret  # noqa: F401