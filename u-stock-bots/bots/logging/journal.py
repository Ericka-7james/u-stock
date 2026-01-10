import json
import os
import time
from dataclasses import asdict
from bots._shared.types import TradeIntent

class Journal:
    def __init__(self, path: str = "logs/journal.ndjson"):
        self.path = path
        os.makedirs(os.path.dirname(path), exist_ok=True)

    def _write(self, data):
        with open(self.path, "a") as f:
            f.write(json.dumps(data) + "\n")

    def log_intent(self, intent: TradeIntent):
        self._write({
            "ts": time.time(),
            "type": "intent",
            "intent": asdict(intent)
        })

    def log_order(self, intent: TradeIntent, result: dict):
        self._write({
            "ts": time.time(),
            "type": "order",
            "symbol": intent.symbol,
            "bot_id": intent.bot_id,
            "result": result
        })

    def log_exit(self, bot_id: str, symbol: str, pnl: float):
        self._write({
            "ts": time.time(),
            "type": "exit",
            "bot_id": bot_id,
            "symbol": symbol,
            "pnl": pnl
        })
