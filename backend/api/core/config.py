# api/core/config.py
from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic import BaseModel, Field, model_validator


class Settings(BaseModel):
    env: str = Field(default_factory=lambda: os.getenv("ENV", "development"))
    database_url: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", ""))

    # ✅ Sanitized at construction time: trims whitespace and drops empties
    cors_origins: List[str] = Field(
        default_factory=lambda: [
            v.strip()
            for v in os.getenv(
                "USTOCK_CORS_ORIGINS",
                "http://localhost:5173,https://u-stock.vercel.app",
            ).split(",")
            if v.strip()
        ]
    )

    supabase_url: str = Field(default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    supabase_anon_key: str = Field(default_factory=lambda: os.getenv("SUPABASE_ANON_KEY", ""))

    @model_validator(mode="after")
    def _require_in_production(self):
        if self.env == "production":
            missing = []
            if not self.database_url:
                missing.append("DATABASE_URL")
            if not self.supabase_url:
                missing.append("SUPABASE_URL")
            if not self.supabase_anon_key:
                missing.append("SUPABASE_ANON_KEY")
            if missing:
                raise ValueError(f"Missing required production env var(s): {', '.join(missing)}")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
