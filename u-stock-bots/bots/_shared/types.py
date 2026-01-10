from __future__ import annotations
from dataclasses import dataclass
from typing import Literal, List, Optional, Dict, Any

Side = Literal["buy", "sell"]

@dataclass
class TradeIntent:
    symbol: str
    side: Side
    entry: float
    stop: float
    take_profit: float
    confidence: float
    bot_id: str
    timeframe: str
    reason_codes: List[str]
    notes: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None
