# u-stock-bots/sitecustomize.py
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

def _load() -> None:
    if load_dotenv is None:
        return

    # This file lives in u-stock-bots/
    root = Path(__file__).resolve().parent

    # Prefer .env.local, fall back to .env
    for p in (root / ".env.local", root / ".env"):
        if p.exists():
            # Don't override explicit OS env vars if they exist
            load_dotenv(p, override=False)

_load()
