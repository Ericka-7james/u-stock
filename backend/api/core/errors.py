# backend/api/core/errors.py
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException


def http_error(
    status_code: int,
    code: str,
    message: str,
    *,
    detail: Any = None,
    hint: Optional[str] = None,
) -> HTTPException:
    """
    Standardize backend error shape so frontend can interpret it.

    Example:
      raise http_error(
        401,
        "ALPACA_INVALID_KEY",
        "Alpaca rejected your credentials",
        detail={"provider": "alpaca"},
        hint="Re-check key/secret and paper/live mode.",
      )
    """
    payload: Dict[str, Any] = {"code": code, "message": message}

    if detail is not None:
        payload["detail"] = detail
    if hint is not None and hint.strip() != "":
        payload["hint"] = hint

    return HTTPException(status_code=status_code, detail=payload)
