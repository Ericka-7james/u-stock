from __future__ import annotations

"""Time and scalar helpers for bot service operations."""

import time
from typing import Any


def now_epoch() -> int:
    """Returns the current UNIX epoch in whole seconds.

    Returns:
        Current UNIX timestamp in seconds.
    """
    return int(time.time())


def epoch_to_iso_z(epoch_seconds: int) -> str:
    """Converts epoch seconds to a UTC ISO-8601 Z timestamp.

    Args:
        epoch_seconds: UNIX timestamp in seconds.

    Returns:
        UTC timestamp formatted as YYYY-MM-DDTHH:MM:SSZ.
    """
    import time as _time

    return _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime(int(epoch_seconds)))


def safe_int(value: Any, default: int = 0) -> int:
    """Converts a value to int safely.

    Args:
        value: Raw value.
        default: Fallback integer.

    Returns:
        Parsed integer or the fallback.
    """
    try:
        return int(value)
    except Exception:
        return int(default)