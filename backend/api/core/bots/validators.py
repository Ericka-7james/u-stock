from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from api.core.bots.constants import BOT_ID_RE, EFFECTIVE_STATES, INTENTS


def clean_bot_id(bot_id: Any) -> str:
    bid = str(bot_id or "").strip()
    if not bid:
        return ""
    if not BOT_ID_RE.match(bid):
        return ""
    return bid


def normalize_mode(x: Any) -> str:
    m = str(x or "paper").strip().lower()
    return m if m in ("paper", "live") else "paper"


def normalize_intent(x: Any, default: str = "paused") -> str:
    v = str(x or "").strip().lower()
    return v if v in INTENTS else default


def normalize_effective_state(x: Any, default: str = "stopped") -> str:
    v = str(x or "").strip().lower()
    return v if v in EFFECTIVE_STATES else default


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_ts_to_epoch_seconds(ts_val: Any) -> int:
    """
    Supabase returns timestamptz as ISO strings.
    Convert to epoch seconds.
    """
    if not ts_val:
        return 0
    if isinstance(ts_val, (int, float)):
        return int(ts_val)
    s = str(ts_val).strip()
    if not s:
        return 0
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except Exception:
        return 0
