# backend/api/settings.py
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional


def _getenv(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _require(name: str) -> str:
    val = _getenv(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


@dataclass(frozen=True)
class Settings:
    """
    Lazy settings: values are read when Settings() is instantiated,
    not at import time. This prevents uvicorn reload/subprocess issues.

    Use strict=True in prod (fail fast). In local dev, strict=False is okay
    if you want the server to boot without external integrations.
    """

    strict: bool = True

    # Required (in strict mode)
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""

    # Optional
    ENV: str = "local"  # local|staging|prod
    ALPACA_TRADE_BASE: str = ""
    ALPACA_DATA_BASE_URL: str = "https://data.alpaca.markets"
    FRED_API_KEY: str = ""
    FMP_API_KEY: str = ""

    def __post_init__(self):
        strict = self.strict

        supabase_url = _getenv("SUPABASE_URL")
        anon = _getenv("SUPABASE_ANON_KEY")
        service = _getenv("SUPABASE_SERVICE_ROLE_KEY")

        # If strict: fail fast
        if strict:
            object.__setattr__(self, "SUPABASE_URL", _require("SUPABASE_URL"))
            object.__setattr__(self, "SUPABASE_ANON_KEY", _require("SUPABASE_ANON_KEY"))
            object.__setattr__(self, "SUPABASE_SERVICE_ROLE_KEY", _require("SUPABASE_SERVICE_ROLE_KEY"))
        else:
            # Non-strict: allow boot for local UI/dev without credentials
            object.__setattr__(self, "SUPABASE_URL", supabase_url)
            object.__setattr__(self, "SUPABASE_ANON_KEY", anon)
            object.__setattr__(self, "SUPABASE_SERVICE_ROLE_KEY", service)

        object.__setattr__(self, "ENV", _getenv("ENV", "local"))
        object.__setattr__(self, "ALPACA_TRADE_BASE", _getenv("ALPACA_TRADE_BASE", ""))
        object.__setattr__(self, "ALPACA_DATA_BASE_URL", _getenv("ALPACA_DATA_BASE_URL", "https://data.alpaca.markets"))
        object.__setattr__(self, "FRED_API_KEY", _getenv("FRED_API_KEY", ""))
        object.__setattr__(self, "FMP_API_KEY", _getenv("FMP_API_KEY", ""))
