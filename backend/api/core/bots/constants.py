# backend/api/core/bots/constants.py
from __future__ import annotations

import os
import re

BOT_ID_RE = re.compile(r"^[a-zA-Z0-9_]{1,64}$")

# heartbeat intent values (runner -> server)
INTENTS = {"running", "paused"}

# desired_state values (ui -> server)
DESIRED_STATES = {"running", "paused", "armed"}

EFFECTIVE_STATES = {
    "starting",
    "running",
    "waiting_for_market",
    "paused",
    "stopped",
    "degraded",
    "error",
    "offline",
}

HEARTBEAT_STALE_SECONDS = int(os.getenv("USTOCK_BOT_HEARTBEAT_STALE_SECONDS", "25"))
BOT_RUNNER_SECRET = (os.getenv("BOT_RUNNER_SECRET") or "").strip()
