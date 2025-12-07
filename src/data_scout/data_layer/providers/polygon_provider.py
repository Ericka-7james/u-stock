# data_scout/data_layer/providers/polygon_provider.py
from __future__ import annotations

from datetime import datetime
from typing import Iterable, List

from polygon import RESTClient

from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.types import Candle, PriceInterval


def _interval_to_polygon(interval: PriceInterval) -> tuple[int, str]:
    """
    Map internal PriceInterval to Polygon multiplier + timespan.
    """
    if interval == "1m":
        return 1, "minute"
    if interval == "5m":
        return 5, "minute"
    if interval == "15m":
        return 15, "minute"
    if interval == "1h":
        return 1, "hour"
    # default
    return 1, "day"


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
        multiplier, timespan = _interval_to_polygon(interval)

        for symbol in symbols:
            resp = self.client.list_aggs(
                ticker=symbol,
                multiplier=multiplier,
                timespan=timespan,
                from_=start.date().isoformat(),
                to=end.date().isoformat(),
                limit=50_000,
            )

            for bar in resp:
                candles.append(
                    Candle(
                        symbol=symbol.upper(),
                        timestamp=bar.timestamp,  # might be int → you can normalize later
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
        now = datetime.utcnow()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        history = self.fetch_history(
            symbols=symbols,
            start=start_of_day,
            end=now,
            interval=interval,
        )

        latest_by_symbol: dict[str, Candle] = {}
        for c in history:
            prev = latest_by_symbol.get(c["symbol"])
            if prev is None or c["timestamp"] > prev["timestamp"]:
                latest_by_symbol[c["symbol"]] = c

        return list(latest_by_symbol.values())
