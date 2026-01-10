# backend/api/settings.py
from __future__ import annotations
import os

def _req(name: str) -> str:
    val = os.getenv(name, "").strip()
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val

class Settings:
    SUPABASE_URL = _req("SUPABASE_URL")
    SUPABASE_ANON_KEY = _req("SUPABASE_ANON_KEY")
    SUPABASE_SERVICE_ROLE_KEY = _req("SUPABASE_SERVICE_ROLE_KEY")

    # Optional, but helpful for prod safety
    ENV = os.getenv("ENV", "local").strip()  # local|staging|prod
    ALPACA_TRADE_BASE = os.getenv("ALPACA_TRADE_BASE", "").strip()
