# src/data_scout/indicators/tests/test_compute_intraday_indicators.py

import pandas as pd

from data_scout.indicators import intraday_indicators


def test_extract_latest_session_rows_picks_last_day():
    rows = [
        {"date": "2025-11-20 14:00:00", "open": 100},
        {"date": "2025-11-21 09:30:00", "open": 101},
        {"date": "2025-11-21 10:00:00", "open": 102},
    ]

    latest = intraday_indicators.extract_latest_session_rows(rows)

    # Expect only the rows for the latest calendar date (2025-11-21)
    assert isinstance(latest, list)
    assert len(latest) == 2
    opens = {r["open"] for r in latest}
    assert opens == {101, 102}


def test_compute_intraday_indicators_for_symbol_basic():
    rows = [
        {
            "date": "2025-11-21 09:30:00",
            "open": 100.0,
            "high": 101.0,
            "low": 99.5,
            "close": 100.5,
            "volume": 1000,
        },
        {
            "date": "2025-11-21 10:00:00",
            "open": 100.5,
            "high": 102.0,
            "low": 100.0,
            "close": 101.5,
            "volume": 1500,
        },
    ]

    ind = intraday_indicators.compute_intraday_indicators_for_symbol("AAPL", rows)

    assert isinstance(ind, dict)
    # sanity-check expected keys; exact values are up to implementation
    assert "intraday_return" in ind
    assert "volume_spike_ratio" in ind
