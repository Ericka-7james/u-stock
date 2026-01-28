from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from core.events.models import BotEvent

# If you want the table configurable:
DEFAULT_EVENTS_TABLE = os.getenv("SUPABASE_EVENTS_TABLE", "bot_events")


class BotEventSink:
    """
    Centralized event sink:
      - Primary: Supabase table insert
      - Secondary: local JSONL append (runtime flight recorder)
    """

    def __init__(self, *, supabase_client=None, events_table: str = DEFAULT_EVENTS_TABLE, runtime_dir: str = "runtime"):
        self.sb = supabase_client
        self.events_table = events_table
        self.runtime_dir = runtime_dir

    def emit(self, event: BotEvent) -> None:
        # Never let logging take down trading.
        try:
            self._emit_supabase(event)
        except Exception:
            pass

        try:
            self._emit_local_jsonl(event)
        except Exception:
            pass

    def _emit_supabase(self, event: BotEvent) -> None:
        if not self.sb:
            return

        payload = {
            "bot_id": event.bot_id,
            "event_type": event.event_type,
            "ts": event.ts.isoformat(),
            "run_id": event.run_id,
            "user_id": event.user_id,
            "data": event.data,
        }

        # supabase-py: sb.table("...").insert(payload).execute()
        self.sb.table(self.events_table).insert(payload).execute()

    def _emit_local_jsonl(self, event: BotEvent) -> None:
        # runtime/bots/<bot_id>/log.jsonl
        base = Path(self.runtime_dir) / "bots" / event.bot_id
        base.mkdir(parents=True, exist_ok=True)

        line = event.model_dump()
        # make datetime json-friendly
        line["ts"] = event.ts.isoformat()

        path = base / "log.jsonl"
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")


# ---- Convenience factory ----

_sink_singleton: Optional[BotEventSink] = None


def get_event_sink() -> BotEventSink:
    """
    Lazy singleton so routes/bots can just call get_event_sink().emit(...)
    """
    global _sink_singleton
    if _sink_singleton is not None:
        return _sink_singleton

    # Import inside to avoid circular imports at startup
    try:
        from api.db import get_supabase_service
        sb = get_supabase_service()
    except Exception:
        sb = None

    _sink_singleton = BotEventSink(supabase_client=sb)
    return _sink_singleton
