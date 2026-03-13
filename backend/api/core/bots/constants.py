from __future__ import annotations

"""Constants for bot service behavior, state normalization, and catalog configuration."""

import re
from typing import Any, Dict, List, Pattern, Set

# -------------------------------------------------------------------
# Heartbeat thresholds
# -------------------------------------------------------------------
HB_5_MIN = 5 * 60
HB_15_MIN = 15 * 60
HB_30_MIN = 30 * 60
HB_1_HOUR = 60 * 60

# -------------------------------------------------------------------
# Bot identifiers
# Keep conservative: lowercase letters/numbers/underscore, must start
# with a letter, and be reasonably short for DB/API safety.
# -------------------------------------------------------------------
BOT_ID_RE: Pattern[str] = re.compile(r"^[a-z][a-z0-9_]{1,63}$")

# -------------------------------------------------------------------
# Intents / requested actions
# These are the user- or UI-driven control states we allow.
# -------------------------------------------------------------------
INTENTS: Set[str] = {
    "start",
    "stop",
    "arm",
    "disarm",
    "restart",
}

# -------------------------------------------------------------------
# Effective states
# These are the normalized states the backend can expose to UI/API.
# Keep this broad enough so validators/state machine logic won't choke
# if different routes/services use slightly different wording.
# -------------------------------------------------------------------
EFFECTIVE_STATES: Set[str] = {
    "unknown",
    "idle",
    "armed",
    "starting",
    "running",
    "stopping",
    "stopped",
    "degraded",
    "error",
    "offline",
}

# -------------------------------------------------------------------
# Bot catalog
# -------------------------------------------------------------------
BOT_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "ema_trend",
        "name": "EMA Trend Bot",
        "description": "Trend-following EMA signals + risk gates.",
        "wired": True,
    },
    {
        "id": "orb",
        "name": "ORB Bot",
        "description": "Opening Range Breakout scanner + execution.",
        "wired": False,
    },
    {
        "id": "mean_revert",
        "name": "Mean Revert Bot",
        "description": "Mean reversion entries with confidence gating.",
        "wired": False,
    },
]

__all__ = [
    "HB_5_MIN",
    "HB_15_MIN",
    "HB_30_MIN",
    "HB_1_HOUR",
    "BOT_ID_RE",
    "INTENTS",
    "EFFECTIVE_STATES",
    "BOT_CATALOG",
]