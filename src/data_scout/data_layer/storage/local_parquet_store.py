# src/data_scout/data_layer/storage/local_parquet_store.py
from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List

import pandas as pd

from data_scout.data_layer.storage.base import PriceDataStore
from data_scout.data_layer.types import Candle, PriceInterval


class LocalParquetPriceDataStore(PriceDataStore):
    """
    Simple local parquet-backed implementation of PriceDataStore.

    Layout on disk (per interval, per symbol):

        root_dir/
          1m/
            AAPL.parquet
            MSFT.parquet
          5m/
            AAPL.parquet
          1d/
            SPY.parquet
    """

    def __init__(self, root_dir: Path | str, interval: PriceInterval = "1d") -> None:
        self.root_dir = Path(root_dir)
        self.interval: PriceInterval = interval
        # Ensure root exists; subdirs per interval will be created lazily.
        self.root_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Internal path helpers
    # ------------------------------------------------------------------ #

    def _interval_dir(self, interval: PriceInterval | None = None) -> Path:
        """
        Directory on disk for a given interval (e.g. root_dir / '1m').
        """
        interval = interval or self.interval
        path = self.root_dir / interval
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _parquet_path_for_symbol(
        self,
        symbol: str,
        interval: PriceInterval | None = None,
    ) -> Path:
        """
        Full parquet file path for a symbol at a given interval.
        """
        interval = interval or self.interval
        interval_dir = self._interval_dir(interval)
        filename = f"{symbol.upper()}.parquet"
        return interval_dir / filename

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def save_candles(self, candles: List[Candle]) -> None:
        """
        Persist a batch of candles into per-symbol parquet files.

        Candles are TypedDicts in practice, so we treat them as dictionaries,
        but we also support any future object-style Candle that has a .symbol
        attribute.
        """
        if not candles:
            return

        by_symbol: Dict[str, List[Candle]] = {}

        for c in candles:
            # Candle is a TypedDict -> dict-style access is the primary path
            if isinstance(c, dict):
                symbol = str(c["symbol"]).upper()
            else:
                # Fallback in case a custom Candle object is passed
                symbol = str(getattr(c, "symbol")).upper()

            by_symbol.setdefault(symbol, []).append(c)

        # Write per-symbol parquet files
        for symbol, symbol_candles in by_symbol.items():
            df = pd.DataFrame(symbol_candles)

            # Keep candles sorted by timestamp so reads are predictable
            if "timestamp" in df.columns:
                df = df.sort_values("timestamp")

            path = self._parquet_path_for_symbol(symbol)

            # Append if file exists, else create
            if path.exists():
                existing = pd.read_parquet(path)
                combined = pd.concat([existing, df], ignore_index=True)

                # Deduplicate (symbol, timestamp) if present
                if {"symbol", "timestamp"}.issubset(combined.columns):
                    combined = (
                        combined.sort_values(["symbol", "timestamp"])
                        .drop_duplicates(subset=["symbol", "timestamp"], keep="last")
                    )

                df_to_write = combined
            else:
                df_to_write = df

            df_to_write.to_parquet(path, index=False)

    def load_history(
        self,
        symbols: Iterable[str],
        start,
        end,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        """
        Load historical candles from local parquet for the given symbols and time range.
        """
        from datetime import datetime  # local import to avoid cycles in some tools

        symbols_list = list(symbols)
        all_candles: List[Candle] = []

        for sym in symbols_list:
            path = self._parquet_path_for_symbol(sym, interval=interval)
            if not path.exists():
                continue

            df = pd.read_parquet(path)

            # If there's a timestamp column, filter by [start, end]
            if "timestamp" in df.columns:
                df = df.copy()
                df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

                start_ts = (
                    start if isinstance(start, datetime) else pd.to_datetime(start, utc=True)
                )
                end_ts = end if isinstance(end, datetime) else pd.to_datetime(end, utc=True)

                mask = (df["timestamp"] >= start_ts) & (df["timestamp"] <= end_ts)
                df = df.loc[mask]

            # Convert back to list-of-dicts Candle objects
            records = df.to_dict("records")
            all_candles.extend(records)  # type: ignore[arg-type]

        return all_candles
