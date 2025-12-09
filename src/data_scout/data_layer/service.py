# data_scout/data_layer/service.py
from __future__ import annotations

from datetime import datetime
from typing import Iterable, List, Optional

from data_scout.data_layer.providers.base import (
    PriceDataProvider,
    build_default_price_provider_from_env,
)
from data_scout.data_layer.storage.local_parquet_store import LocalParquetPriceDataStore
from data_scout.data_layer.types import Candle, PriceInterval
from data_scout.data_layer.storage.base import PriceDataStore


class PriceDataService:
    """
    Facade for all price data access.

    - Chooses provider(s) (Alpaca / Polygon / Yahoo / Webull via Composite)
    - Uses local Parquet as cache
    - Exposes simple get_history / get_latest methods.
    """

    def __init__(
        self,
        provider: Optional[PriceDataProvider] = None,
        store: Optional[PriceDataStore] = None,
    ):
        # If no provider is passed, build a composite from env (Alpaca, Polygon, Yahoo, Webull hook).
        self.provider = provider or build_default_price_provider_from_env()
        # Default store is local parquet
        self.store = store or LocalParquetPriceDataStore()

    def get_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        # Normalize to list to preserve input order
        symbols_list = list(symbols)

        # 1. Load whatever we already have in the store
        cached = self.store.load_history(
            symbols=symbols_list,
            start=start,
            end=end,
            interval=interval,
        )

        # Index cached by symbol for quick lookup
        cached_symbols = {c["symbol"] for c in cached}

        # 2. Compute missing symbols IN INPUT ORDER (no sets that lose ordering)
        missing_symbols = [s for s in symbols_list if s not in cached_symbols]

        fetched: List[Candle] = []
        if missing_symbols:
            # 3. Ask provider for exactly those symbols, in that order
            fetched = self.provider.fetch_history(
                symbols=missing_symbols,
                start=start,
                end=end,
                interval=interval,
            )

            # 4. Persist new candles
            if fetched:
                self.store.save_candles(fetched)

        # 5. Return merged list
        return cached + fetched

    def get_latest(
        self,
        symbols: Iterable[str],
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        """
        Convenience wrapper for "just give me the latest bar per symbol",
        using provider + optionally writing to the store.
        """
        symbols_list = list(symbols)

        latest = self.provider.fetch_latest(symbols=symbols_list, interval=interval)

        if latest:
            self.store.save_candles(latest)

        return latest
