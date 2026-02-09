# backend/api/core/bots/constants.py
from __future__ import annotations

import os
import re

BOT_ID_RE = re.compile(r"^[a-zA-Z0-9_]{1,64}$")

# intent values (user lifecycle intent)
# running = user wants bot executing
# stopped = user explicitly stopped / not started
INTENTS = {"running", "stopped"}

# desired_state values (UI composite)
DESIRED_STATES = {"running", "stopped", "armed", "disarmed"}

# effective_state values (runner reality)
EFFECTIVE_STATES = {
    "starting",
    "running",
    "waiting_for_market",
    "stopped",
    "degraded",
    "error",
    "offline",
}

HEARTBEAT_STALE_SECONDS = int(os.getenv("USTOCK_BOT_HEARTBEAT_STALE_SECONDS", "25"))
BOT_RUNNER_SECRET = (os.getenv("BOT_RUNNER_SECRET") or "").strip()
