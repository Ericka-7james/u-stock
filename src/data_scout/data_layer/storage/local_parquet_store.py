# data_scout/data_layer/storage/local_parquet_store.py
from datetime import datetime
from pathlib import Path
from typing import Iterable, List

import pandas as pd

from data_scout.data_layer.storage.base import PriceDataStore
from data_scout.data_layer.types import Candle


class LocalParquetPriceDataStore(PriceDataStore):
    def __init__(self, root_dir: str = "data/prices"):
        self.root = Path(root_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def _symbol_path(self, symbol: str) -> Path:
        return self.root / f"{symbol.upper()}.parquet"

    def save_candles(self, candles: List[Candle]) -> None:
        if not candles:
            return

        by_symbol = {}
        for c in candles:
            by_symbol.setdefault(c.symbol.upper(), []).append(c)

        for symbol, sym_candles in by_symbol.items():
            path = self._symbol_path(symbol)
            df_new = pd.DataFrame(
                [
                    {
                        "timestamp": c.timestamp,
                        "open": c.open,
                        "high": c.high,
                        "low": c.low,
                        "close": c.close,
                        "volume": c.volume,
                    }
                    for c in sym_candles
                ]
            ).set_index("timestamp")

            if path.exists():
                df_old = pd.read_parquet(path)
                df = (
                    pd.concat([df_old, df_new])
                    .sort_index()
                    .groupby(level=0)
                    .last()
                )
            else:
                df = df_new

            df.to_parquet(path)

    def load_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: str = "1d",
    ) -> List[Candle]:
        candles: List[Candle] = []
        for symbol in symbols:
            path = self._symbol_path(symbol)
            if not path.exists():
                continue
            df = pd.read_parquet(path)
            df = df.loc[(df.index >= start) & (df.index <= end)]
            for ts, row in df.iterrows():
                candles.append(
                    Candle(
                        symbol=symbol.upper(),
                        timestamp=ts.to_pydatetime(),
                        open=float(row["open"]),
                        high=float(row["high"]),
                        low=float(row["low"]),
                        close=float(row["close"]),
                        volume=float(row["volume"]),
                    )
                )
        return candles
