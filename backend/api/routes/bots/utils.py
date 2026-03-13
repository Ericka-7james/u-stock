# backend/api/routes/bots/utils.py

"""Shared helpers for bot route modules.

This module contains validation, normalization, parsing, and response-shaping
helpers used across the modular bot route package.

The functions here are intentionally small and framework-light so route
modules can reuse consistent behavior without duplicating request parsing
logic.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List

from fastapi import HTTPException

from api.core.bots.validators import clean_bot_id, normalize_mode, parse_ts_to_epoch_seconds


def epoch_to_iso_z(ep: int) -> str:
    """Converts epoch seconds to an ISO-8601 UTC string.

    Args:
        ep: Epoch timestamp in seconds.

    Returns:
        str: UTC timestamp formatted like 2026-03-10T15:42:00Z.
    """
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(ep)))


def safe_int(value: Any, default: int = 0) -> int:
    """Safely converts a value to int.

    Args:
        value: Value to convert.
        default: Fallback value if conversion fails.

    Returns:
        int: Parsed integer or default.
    """
    try:
        return int(value)
    except Exception:
        return int(default)


def as_dict(value: Any) -> Dict[str, Any]:
    """Returns the value as a dict if possible, otherwise an empty dict.

    Args:
        value: Arbitrary value.

    Returns:
        Dict[str, Any]: Input value if it is a dict, else {}.
    """
    return value if isinstance(value, dict) else {}


def require_bot_id(raw: Any) -> str:
    """Validates and normalizes a bot id.

    Args:
        raw: Raw bot id.

    Returns:
        str: Cleaned bot id.

    Raises:
        HTTPException: If bot id is missing or invalid.
    """
    bid = clean_bot_id(raw)
    if not bid:
        raise HTTPException(status_code=400, detail="bot_id required")
    return bid


def require_payload_obj(payload: Any) -> Dict[str, Any]:
    """Ensures the request body is a JSON object.

    Args:
        payload: Incoming request body.

    Returns:
        Dict[str, Any]: Validated payload object.

    Raises:
        HTTPException: If the payload is not an object.
    """
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be an object")
    return payload


def normalize_payload_bot_mode(payload: Dict[str, Any]) -> str:
    """Normalizes a mode field from a payload.

    Args:
        payload: Request payload.

    Returns:
        str: Normalized mode.
    """
    return normalize_mode(payload.get("mode"))


def extract_rows(result: Any) -> List[Dict[str, Any]]:
    """Extracts a list of row dicts from a Supabase response.

    Args:
        result: Supabase execute() result.

    Returns:
        List[Dict[str, Any]]: Normalized list of rows.
    """
    rows = None

    if hasattr(result, "data"):
        rows = getattr(result, "data", None)
    elif isinstance(result, dict):
        rows = result.get("data")

    if not isinstance(rows, list):
        return []

    return [row for row in rows if isinstance(row, dict)]


def build_event_item(row: Dict[str, Any]) -> Dict[str, Any]:
    """Builds a normalized event item from a database row.

    Args:
        row: Event row from storage.

    Returns:
        Dict[str, Any]: API-safe normalized event payload.
    """
    payload = row.get("payload")
    if not isinstance(payload, dict):
        payload = {"raw": payload}

    ts = parse_ts_to_epoch_seconds(row.get("ts"))

    return {
        "ts": ts if ts > 0 else 0,
        "level": str(row.get("level") or "info").strip().lower(),
        "event_type": str(row.get("event_type") or "").strip(),
        "symbol": (str(row.get("symbol") or "").strip().upper() or None),
        "event_id": (str(row.get("event_id") or "").strip() or None),
        "payload": payload,
    }