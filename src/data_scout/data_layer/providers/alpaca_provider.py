# src/data_scout/data_layer/providers/alpaca_provider.py
from datetime import datetime
from typing import Iterable, List

from alpaca.data import StockHistoricalDataClient, StockBarsRequest, TimeFrame

from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.types import Candle, PriceInterval


_INTERVAL_TO_TIMEFRAME = {
    "1m": TimeFrame.Minute,
    "5m": TimeFrame(5, "Min"),
    "15m": TimeFrame(15, "Min"),
    "1h": TimeFrame.Hour,
    "1d": TimeFrame.Day,
}


class AlpacaPriceDataProvider(PriceDataProvider):
    def __init__(self, api_key: str, api_secret: str):
        self.client = StockHistoricalDataClient(api_key, api_secret)

    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        timeframe = _INTERVAL_TO_TIMEFRAME[interval]
        request = StockBarsRequest(
            symbol_or_symbols=list(symbols),
            timeframe=timeframe,
            start=start,
            end=end,
        )

        raw_bars = self.client.get_stock_bars(request)
        candles: List[Candle] = []

        for symbol, bars in raw_bars.data.items():
            for bar in bars:
                candles.append(
                    Candle(
                        symbol=symbol,
                        timestamp=bar.timestamp,
                        open=float(bar.open),
                        high=float(bar.high),
                        low=float(bar.low),
                        close=float(bar.close),
                        volume=float(bar.volume),
                    )
                )

        return candles

    def fetch_latest(
        self,
        symbols: Iterable[str],
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        # Simplest: request a small history window and take the last bar
        now = datetime.utcnow()
        # For intraday you might use now - 1 day, etc.
        candles = self.fetch_history(symbols, start=now.replace(hour=0, minute=0, second=0, microsecond=0), end=now, interval=interval)
        return candles
