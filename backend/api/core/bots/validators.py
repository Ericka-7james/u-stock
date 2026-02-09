from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from api.core.bots.constants import BOT_ID_RE, EFFECTIVE_STATES, INTENTS


def clean_bot_id(bot_id: Any) -> str:
    """
    Strictly validate bot IDs.
    Prevents injection, typos, and phantom bots.
    """
    bid = str(bot_id or "").strip()
    if not bid:
        return ""
    if not BOT_ID_RE.match(bid):
        return ""
    return bid


def normalize_mode(x: Any) -> str:
    """
    Normalize trading mode.
    Fail-safe default is paper.
    """
    m = str(x or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def normalize_intent(x: Any, default: str = "paused") -> str:
    """
    Normalize intent coming from UI or runner.

    TODO:
    - If you later allow 'starting' or 'waiting_for_market' as intents,
      add them to INTENTS.
    """
    v = str(x or "").strip().lower()
    return v if v in INTENTS else default


def normalize_effective_state(x: Any, default: str = "stopped") -> str:
    """
    Normalize effective_state reported by runner.

    IMPORTANT:
    - effective_state should *only* describe reality,
      never user desire.
    """
    v = str(x or "").strip().lower()
    return v if v in EFFECTIVE_STATES else default


def iso_now() -> str:
    """
    UTC ISO timestamp used for Supabase writes.
    """
    return datetime.now(timezone.utc).isoformat()


def parse_ts_to_epoch_seconds(ts_val: Any) -> int:
    """
    Convert Supabase timestamptz (ISO string) → epoch seconds.

    CRITICAL:
    - Heartbeat age
    - Log ordering
    - Offline detection

    This function must NEVER throw.
    """
    if not ts_val:
        return 0

    # Already epoch
    if isinstance(ts_val, (int, float)):
        return int(ts_val)

    s = str(ts_val).strip()
    if not s:
        return 0

    # Supabase often returns Z instead of +00:00
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"

    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        # TODO:
        # - If this ever happens frequently, log once server-side.
        return 0
