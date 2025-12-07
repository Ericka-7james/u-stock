# data_scout/data_layer/service.py
from __future__ import annotations

from datetime import datetime
from typing import Iterable, List, Optional

from data_scout.data_layer.providers.yahoo_provider import YahooPriceDataProvider
from data_scout.data_layer.storage.local_parquet_store import LocalParquetPriceDataStore
from data_scout.data_layer.types import Candle, PriceInterval
from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.storage.base import PriceDataStore  # if you have one


class PriceDataService:
    """
    Facade for all price data access.

    - Chooses a provider (Yahoo / Alpaca / Polygon)
    - Uses local Parquet as cache
    - Exposes simple get_history / get_latest methods.
    """

    def __init__(
        self,
        provider: Optional[PriceDataProvider] = None,
        store: Optional[PriceDataStore] = None,
    ):
        self.provider = provider or YahooPriceDataProvider()
        self.store = store or LocalParquetPriceDataStore()

    def get_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
        use_cache: bool = True,
    ) -> List[Candle]:
        symbols_list = [s.upper() for s in symbols]
        cached: List[Candle] = []
        missing_symbols = set(symbols_list)

        if use_cache:
            cached = self.store.load_history(symbols_list, start, end, interval)
            have = {c["symbol"] for c in cached}
            missing_symbols = missing_symbols - have

        fetched: List[Candle] = []
        if missing_symbols:
            fetched = self.provider.fetch_history(missing_symbols, start, end, interval)
            if fetched:
                self.store.save_candles(fetched)

        return cached + fetched

    def get_latest(
        self,
        symbols: Iterable[str],
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        candles = self.provider.fetch_latest(symbols, interval)
        if candles:
            self.store.save_candles(candles)
        return candles
