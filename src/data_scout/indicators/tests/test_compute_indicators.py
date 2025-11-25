# src/indicators/tests/test_compute_indicators.py
from datetime import datetime, timezone

import pytest

from data_scout.indicators import compute_indicators


def test_compute_daily_returns_basic():
    # close prices: 100 -> 105 -> 110
    rows = [
        {"close": 100.0},
        {"close": 105.0},
        {"close": 110.0},
    ]

    returns = compute_indicators.compute_daily_returns(rows)
    # (105/100 - 1) = 0.05; (110/105 - 1) ≈ 0.047619
    assert pytest.approx(returns[0], rel=1e-6) == 0.05
    assert pytest.approx(returns[1], rel=1e-6) == (110.0 / 105.0 - 1.0)


def test_compute_indicators_for_symbol_happy_path():
    # Two days of daily prices (already sorted)
    daily_prices = [
        {"date": "2025-11-20", "close": 100.0},
        {"date": "2025-11-21", "close": 105.0},
    ]

    fundamentals = {
        "trading_snapshot": {
            "regularMarketOpen": 104.0,
            "regularMarketDayHigh": 108.0,
            "regularMarketDayLow": 102.0,
            "regularMarketVolume": 2_000_000,
            "averageDailyVolume10Day": 1_000_000,
            "regularMarketPreviousClose": 100.0,
        }
    }

    ind = compute_indicators.compute_indicators_for_symbol(
        "AAPL", daily_prices, fundamentals
    )

    # Should contain all expected keys
    for key in [
        "symbol",
        "close_return_1d",
        "gap_pct",
        "day_range_pct",
        "volume_ratio",
        "vol_10d",
        "in_play_score",
    ]:
        assert key in ind

    # Basic sanity checks on values
    assert ind["symbol"] == "AAPL"
    # 1d return: (105/100 - 1) = 5%
    assert pytest.approx(ind["close_return_1d"], rel=1e-6) == 0.05
    # gap: 104 / 100 - 1 = 4%
    assert pytest.approx(ind["gap_pct"], rel=1e-6) == 0.04
    # day_range_pct: (108-102)/104
    assert pytest.approx(ind["day_range_pct"], rel=1e-6) == (108.0 - 102.0) / 104.0
    # volume_ratio: 2M / 1M = 2
    assert pytest.approx(ind["volume_ratio"], rel=1e-6) == 2.0
    # in_play_score is some positive number
    assert ind["in_play_score"] >= 0.0


def test_compute_indicators_for_symbol_not_enough_history():
    # Only one price row -> should return {}
    daily_prices = [{"date": "2025-11-20", "close": 100.0}]
    fundamentals = {}

    ind = compute_indicators.compute_indicators_for_symbol(
        "AAPL", daily_prices, fundamentals
    )
    assert ind == {}
