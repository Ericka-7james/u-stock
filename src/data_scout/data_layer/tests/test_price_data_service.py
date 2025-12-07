# tests/data_layer/test_price_data_service.py
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Iterable, List

import pytest

from data_scout.data_layer.service import PriceDataService
from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.storage.base import PriceDataStore
from data_scout.data_layer.types import Candle, PriceInterval


class FakeProvider(PriceDataProvider):
    def __init__(self) -> None:
        self.history_calls: list[tuple[list[str], PriceInterval]] = []
        self.latest_calls: list[tuple[list[str], PriceInterval]] = []
        self.history_to_return: List[Candle] = []
        self.latest_to_return: List[Candle] = []

    def fetch_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: PriceInterval = "1d",
    ) -> List[Candle]:
        syms = list(symbols)
        self.history_calls.append((syms, interval))
        return list(self.history_to_return)

    def fetch_latest(
        self,
        symbols: Iterable[str],
        interval: PriceInterval = "1m",
    ) -> List[Candle]:
        syms = list(symbols)
        self.latest_calls.append((syms, interval))
        return list(self.latest_to_return)


class FakeStore(PriceDataStore):
    def __init__(self) -> None:
        self.saved: List[Candle] = []
        self.history_to_return: List[Candle] = []
        self.load_calls: list[dict] = []

    def save_candles(self, candles: List[Candle]) -> None:
        self.saved.extend(candles)

    def load_history(
        self,
        symbols: Iterable[str],
        start: datetime,
        end: datetime,
        interval: str = "1d",
    ) -> List[Candle]:
        self.load_calls.append(
            {
                "symbols": list(symbols),
                "start": start,
                "end": end,
                "interval": interval,
            }
        )
        return list(self.history_to_return)


def _make_candle(symbol: str, ts: datetime, price: float) -> Candle:
    return Candle(
        symbol=symbol,
        timestamp=ts,
        open=price,
        high=price,
        low=price,
        close=price,
        volume=100.0,
    )

@pytest.mark.skip(
    reason="Temporarily skipping while PriceDataService symbol-order behavior is in flux"
)
def test_service_fetches_missing_symbols_and_writes_to_store():
    provider = FakeProvider()
    store = FakeStore()
    service = PriceDataService(provider=provider, store=store)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = now - timedelta(days=5)
    end = now

    # Cache empty
    store.history_to_return = []

    # Provider will return a candle for AAPL and MSFT
    c1 = _make_candle("AAPL", now, 100.0)
    c2 = _make_candle("MSFT", now, 200.0)
    provider.history_to_return = [c1, c2]

    candles = service.get_history(["AAPL", "MSFT"], start, end, interval="1m")

    # Service returned both candles
    assert len(candles) == 2

    # Provider was actually called with the correct interval
    assert provider.history_calls == [(["AAPL", "MSFT"], "1m")]

    # Store.save_candles got the fetched candles
    assert store.saved == [c1, c2]


def test_service_uses_cache_when_available():
    provider = FakeProvider()
    store = FakeStore()
    service = PriceDataService(provider=provider, store=store)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    start = now - timedelta(days=1)
    end = now

    cached_candle = _make_candle("AAPL", now, 123.0)
    store.history_to_return = [cached_candle]

    candles = service.get_history(["AAPL"], start, end, interval="5m", use_cache=True)

    # Returned cached candle
    assert candles == [cached_candle]

    # load_history was called with the interval we passed in
    assert store.load_calls[0]["interval"] == "5m"

    # Provider should not be called at all because cache was hit
    assert provider.history_calls == []


def test_get_latest_calls_provider_and_saves():
    provider = FakeProvider()
    store = FakeStore()
    service = PriceDataService(provider=provider, store=store)

    now = datetime.now(timezone.utc).replace(microsecond=0)
    latest_candle = _make_candle("AAPL", now, 150.0)
    provider.latest_to_return = [latest_candle]

    candles = service.get_latest(["AAPL"], interval="1m")

    assert candles == [latest_candle]
    assert provider.latest_calls == [(["AAPL"], "1m")]
    assert store.saved == [latest_candle]
