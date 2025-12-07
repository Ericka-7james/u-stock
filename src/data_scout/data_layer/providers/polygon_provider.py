# src/data_scout/data_layer/providers/polygon_provider.py
from datetime import datetime
from typing import Iterable, List

from polygon import RESTClient

from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.types import Candle, PriceInterval


class PolygonPriceDataProvider(PriceDataProvider):
    def __init__(self, api_key: str):
        self.client = RESTClient(api_key)

    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        candles: List[Candle] = []
        timespan = "minute" if interval in ("1m", "5m", "15m") else "day"

        for symbol in symbols:
            # NOTE: you’d need to translate interval -> multiplier + timespan properly
            resp = self.client.list_aggs(
                ticker=symbol,
                multiplier=1,
                timespan=timespan,
                from_=start.date().isoformat(),
                to=end.date().isoformat(),
                limit=50000,
            )
            for bar in resp:
                candles.append(
                    Candle(
                        symbol=symbol,
                        timestamp=bar.timestamp,  # may need datetime conversion
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
        # Same idea: query recent aggs, take last per symbol.
        now = datetime.utcnow()
        candles = self.fetch_history(symbols, start=now.replace(hour=0, minute=0, second=0, microsecond=0), end=now, interval=interval)
        return candles
