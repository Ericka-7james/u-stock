from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class AlpacaCredsOut(BaseModel):
    ok: bool = True
    provider: str = "alpaca"
    status: str
    mode: Optional[str] = "paper"
    api_key: Optional[str] = None
    api_secret: Optional[str] = None


class AlpacaKeysIn(BaseModel):
    api_key: str = Field(..., min_length=5)
    api_secret: str = Field(..., min_length=5)
    mode: Optional[Literal["paper", "live"]] = "paper"


class AlpacaKeysOut(BaseModel):
    ok: bool = True
    provider: str = "alpaca"
    status: str = "connected"
    mode: str = "paper"


def normalize_mode(mode: Optional[str]) -> str:
    m = str(mode or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"
