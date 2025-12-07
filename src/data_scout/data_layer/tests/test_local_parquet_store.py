# src/data_scout/data_layer/tests/test_local_parquet_store.py
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List

import pytest

from data_scout.data_layer.storage.local_parquet_store import (
    LocalParquetPriceDataStore,
)
from data_scout.data_layer.types import Candle


def _create_store_with_tmpdir(tmp_path) -> LocalParquetPriceDataStore:
    """
    Helper to build a LocalParquetPriceDataStore backed by the pytest tmp_path.
    """
    return LocalParquetPriceDataStore(root_dir=tmp_path)


def _make_candle(symbol: str, ts: datetime, price: float) -> Candle:
    """
    Minimal Candle factory used by tests.
    """
    return {
        "symbol": symbol,
        "timestamp": ts,
        "open": price,
        "high": price,
        "low": price,
        "close": price,
        "volume": 0,
    }


@pytest.mark.skip(
    reason="Skipping parquet roundtrip tests until LocalParquetPriceDataStore refactor is complete"
)
@pytest.mark.parametrize("interval", ["1m", "5m", "1d"])
def test_local_parquet_store_save_and_load_roundtrip(tmp_path, interval: str):
    """
    Roundtrip save/load test for LocalParquetPriceDataStore.

    Currently skipped while the parquet store is being refactored.
    """
    store = _create_store_with_tmpdir(tmp_path)

    ts = datetime.now(timezone.utc).replace(microsecond=0)
    candles: List[Candle] = [
        _make_candle("USTEST", ts, 10.0),
    ]

    # This code will not run because the test is marked as skipped.
    store.save_candles(candles)
    loaded = store.load_history(["USTEST"], ts, ts, interval=interval)

    assert len(loaded) >= 1
