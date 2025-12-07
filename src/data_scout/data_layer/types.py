# data_scout/data_layer/types.py
from __future__ import annotations

from datetime import datetime
from typing import Literal, TypedDict


# All supported bar sizes for the data layer.
PriceInterval = Literal["1m", "5m", "15m", "1h", "1d"]


class Candle(TypedDict):
    """
    Normalized OHLCV bar used everywhere in the data layer.

    NOTE:
    - timestamp is always UTC-aware datetime
    - symbol is always uppercase ticker
    """
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
