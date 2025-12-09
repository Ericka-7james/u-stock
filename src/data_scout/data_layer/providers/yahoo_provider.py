# data_scout/data_layer/providers/yahoo_provider.py
from __future__ import annotations

from datetime import datetime
from typing import Iterable, List

import yfinance as yf

from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.types import Candle, PriceInterval


class YahooPriceDataProvider(PriceDataProvider):
    """
    Simple provider backed by yfinance.

    Good for:
      - Historical daily / intraday bars
      - Fallback when "real" market data APIs aren't configured
    """

    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        candles: List[Candle] = []

        for symbol in symbols:
            df = yf.download(
                symbol,
                start=start,
                end=end,
                interval=interval,  # yfinance understands "1m", "5m", "1d", etc.
                progress=False,
            )
            df = df.dropna()

            for ts, row in df.iterrows():
                # yfinance timestamps are usually timezone-aware already
                ts_dt = ts.to_pydatetime()

                candles.append(
                    Candle(
                        symbol=symbol.upper(),
                        timestamp=ts_dt,
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
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        # Simple version: fetch today's history and keep last bar per symbol.
        now = datetime.utcnow()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        history = self.fetch_history(
            symbols=symbols,
            start=start_of_day,
            end=now,
            interval=interval,
        )

        # Compress to the latest bar per symbol
        latest_by_symbol: dict[str, Candle] = {}
        for c in history:
            prev = latest_by_symbol.get(c["symbol"])
            if prev is None or c["timestamp"] > prev["timestamp"]:
                latest_by_symbol[c["symbol"]] = c

        return list(latest_by_symbol.values())
