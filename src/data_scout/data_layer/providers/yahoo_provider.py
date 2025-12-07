# data_scout/data_layer/providers/yahoo_provider.py
from datetime import datetime
from typing import Iterable, List

import yfinance as yf

from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.types import Candle


class YahooPriceDataProvider(PriceDataProvider):
    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: str = "1d",
    ) -> List[Candle]:
        candles: List[Candle] = []
        for symbol in symbols:
            df = yf.download(
                symbol,
                start=start,
                end=end,
                interval=interval,
                progress=False,
            )
            df = df.dropna()
            for ts, row in df.iterrows():
                candles.append(
                    Candle(
                        symbol=symbol,
                        timestamp=ts.to_pydatetime(),
                        open=float(row["Open"]),
                        high=float(row["High"]),
                        low=float(row["Low"]),
                        close=float(row["Close"]),
                        volume=float(row["Volume"]),
                    )
                )
        return candles

    def fetch_latest(
        self,
        symbols: Iterable[str],
        interval: str = "1m",
    ) -> List[Candle]:
        # Simple version: use last row from a recent history fetch
        now = datetime.utcnow()
        # e.g. fetch last day and take last candle per symbol
        candles = self.fetch_history(
            symbols=symbols,
            start=now.replace(hour=0, minute=0, second=0, microsecond=0),
            end=now,
            interval=interval,
        )
        # Could compress to latest per symbol, but keep simple for now
        return candles
