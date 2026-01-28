from __future__ import annotations

import time
from typing import Any, Dict, Optional


class TTLCache:
    """
    Simple per-process TTL cache.
    For multi-worker/multi-instance, replace with Redis later.
    """

    def __init__(self):
        self._data: Dict[str, Dict[str, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        entry = self._data.get(key)
        if not entry:
            return None
        if time.time() > entry["expires_at"]:
            self._data.pop(key, None)
            return None
        return entry["value"]

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._data[key] = {"value": value, "expires_at": time.time() + int(ttl_seconds)}
