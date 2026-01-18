from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

import requests


def _now_iso() -> str:
    # ISO-ish is fine; Supabase accepts RFC3339-ish strings.
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _env(name: str, default: str = "") -> str:
    v = os.getenv(name, default)
    return str(v).strip()


def _enabled() -> bool:
    return bool(_env("SUPABASE_URL") and _env("SUPABASE_SERVICE_ROLE_KEY"))


def emit_event(
    *,
    bot_id: str,
    mode: str,
    event_type: str,
    level: str = "info",
    symbol: Optional[str] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Upload a single event row to Supabase (REST insert).

    Designed for *important* events only (orders, failures, fills).
    NOT for heartbeats or frequent status.
    """
    if not _enabled():
        return False

    supabase_url = _env("SUPABASE_URL").rstrip("/")
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    table = _env("SUPABASE_EVENTS_TABLE", "bot_events")

    b = str(bot_id or "").strip()
    if not b:
        return False

    m = str(mode or "paper").strip().lower()
    if m not in ("paper", "live"):
        m = "paper"

    row = {
        "ts": _now_iso(),
        "bot_id": b,
        "mode": m,
        "level": str(level or "info").lower(),
        "event_type": str(event_type or "unknown"),
        "symbol": (str(symbol).upper().strip() if symbol else None),
        "payload": payload or {},
    }

    url = f"{supabase_url}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    try:
        r = requests.post(url, headers=headers, json=row, timeout=8)
        return 200 <= r.status_code < 300
    except Exception:
        return False
