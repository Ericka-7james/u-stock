# data_scout/data_layer/providers/base.py
from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Iterable, List

from data_scout.data_layer.types import Candle, PriceInterval


class PriceDataProvider(ABC):
    """
    Abstract interface for any market data provider (Yahoo, Alpaca, Polygon, ...).

    All providers must return normalized Candle objects using UTC timestamps
    and accept a PriceInterval.
    """

    @abstractmethod
    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        """Fetch historical candles for one or more symbols."""
        raise NotImplementedError

    @abstractmethod
    def fetch_latest(
        self,
        symbols: Iterable[str],
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        """
        Fetch the most recent candle(s) for one or more symbols.
        Simplest version can just call fetch_history(...) and return
        the last bar per symbol.
        """
        raise NotImplementedError
