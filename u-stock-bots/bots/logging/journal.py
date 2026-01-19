from __future__ import annotations

import json
import os
import time
from dataclasses import asdict
from typing import Any, Callable, Dict, Optional

from bots._shared.types import TradeIntent


class Journal:
    """
    NDJSON append-only journal.

    Production-ready tweaks:
      - handles paths with no directory (e.g. "journal.ndjson")
      - utf-8 writes
      - optional fsync for durability
      - injectable time function for deterministic tests
      - best-effort logging: never raises into trading logic
    """

    def __init__(
        self,
        path: str = "logs/journal.ndjson",
        *,
        now_fn: Optional[Callable[[], float]] = None,
        fsync: bool = False,
    ):
        self.path = path
        self._now_fn = now_fn or time.time
        self._fsync = bool(fsync)

        d = os.path.dirname(path)
        if d:
            os.makedirs(d, exist_ok=True)

    def _write(self, data: Dict[str, Any]) -> None:
        try:
            line = json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n"
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(line)
                f.flush()
                if self._fsync:
                    os.fsync(f.fileno())
        except Exception:
            # never let logging crash the bot loop
            return

    def log_intent(self, intent: TradeIntent) -> None:
        self._write(
            {
                "ts": float(self._now_fn()),
                "type": "intent",
                "intent": asdict(intent),
            }
        )

    def log_order(self, intent: TradeIntent, result: Dict[str, Any]) -> None:
        self._write(
            {
                "ts": float(self._now_fn()),
                "type": "order",
                "symbol": intent.symbol,
                "bot_id": intent.bot_id,
                "result": result,
            }
        )

    def log_exit(self, bot_id: str, symbol: str, pnl: float) -> None:
        self._write(
            {
                "ts": float(self._now_fn()),
                "type": "exit",
                "bot_id": bot_id,
                "symbol": symbol,
                "pnl": float(pnl),
            }
        )
