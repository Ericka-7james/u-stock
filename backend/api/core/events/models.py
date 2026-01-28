from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field

BotEventType = Literal[
    "bot_started",
    "bot_paused",
    "bot_resumed",
    "bot_stopped",
    "bot_error",
    "order_submitted",
    "order_filled",
    "signal_generated",
    "heartbeat",
]


class BotEvent(BaseModel):
    bot_id: str
    event_type: BotEventType
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Optional correlation IDs for traceability across systems
    run_id: Optional[str] = None
    user_id: Optional[str] = None

    # Free-form structured details (safe for debugging + UI)
    data: Dict[str, Any] = Field(default_factory=dict)
