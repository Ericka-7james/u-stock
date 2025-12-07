# data_scout/data_layer/storage/base.py
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Iterable, List

from data_scout.data_layer.types import Candle


class PriceDataStore(ABC):
    @abstractmethod
    def save_candles(self, candles: List[Candle]) -> None:
        """Persist candles to local storage."""
        raise NotImplementedError()

    @abstractmethod
    def load_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: str = "1d",
    ) -> List[Candle]:
        """Load candles from storage if present."""
        raise NotImplementedError()
