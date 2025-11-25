# src/data_scout/indicators/tests/test_multiday_indicators.py

import json
from pathlib import Path

import pandas as pd

from data_scout.indicators import multiday_indicators


def test_load_prices_raw_flattens_json(tmp_path):
    # Build a tiny prices-raw-like JSON file
    payload = {
        "generated_at": "2025-11-24T00:00:00Z",
        "symbols": ["AAPL"],
        "prices": {
            "AAPL": [
                {
                    "symbol": "AAPL",
                    "date": "2025-11-20T00:00:00Z",
                    "close": 100.0,
                },
                {
                    "symbol": "AAPL",
                    "date": "2025-11-21T00:00:00Z",
                    "close": 105.0,
                },
            ]
        },
    }

    path = tmp_path / "prices-raw.json"
    path.write_text(json.dumps(payload), encoding="utf-8")

    snapshot = multiday_indicators.load_prices_raw(path)

    assert snapshot.generated_at == "2025-11-24T00:00:00Z"
    assert snapshot.symbols == ["AAPL"]
    assert not snapshot.frame.empty
    assert list(snapshot.frame["close"]) == [100.0, 105.0]


def test__compute_indicators_for_ticker_windows():
    # 6 days of prices so that 1d, 3d, 5d returns and some vols are computable
    dates = pd.date_range("2025-11-15", periods=6, tz="UTC")
    closes = [100, 101, 102, 103, 104, 105]
    df_ticker = pd.DataFrame({"date": dates, "close": closes})

    ind = multiday_indicators._compute_indicators_for_ticker(df_ticker)

    assert isinstance(ind, dict)
    # just check expected keys
    assert "return_1d" in ind
    assert "return_3d" in ind
    assert "return_5d" in ind


def test_compute_multiday_indicators_payload_shape():
    dates = pd.date_range("2025-11-20", periods=3, tz="UTC")
    df = pd.DataFrame(
        {
            "ticker": ["AAPL", "AAPL", "AAPL"],
            "date": dates,
            "close": [100.0, 101.0, 102.0],
        }
    )

    snapshot = multiday_indicators.PricesRawSnapshot(
        generated_at="2025-11-24T00:00:00Z",
        symbols=["AAPL"],
        frame=df,
    )

    payload = multiday_indicators.compute_multiday_indicators(snapshot)

    assert isinstance(payload, dict)
    assert set(payload.keys()) == {
        "generatedAt",
        "windowDescription",
        "universe",
        "data",
    }
    assert payload["universe"] == ["AAPL"]
    assert isinstance(payload["data"], list)


def test_save_multiday_indicators_writes_file(tmp_path):
    payload = {
        "generatedAt": "2025-11-24T00:00:00Z",
        "windowDescription": "test",
        "universe": ["AAPL"],
        "data": [],
    }

    out_path = multiday_indicators.save_multiday_indicators(
        payload, path=tmp_path / "multiday-indicators.json"
    )

    assert out_path.exists()

    loaded = json.loads(out_path.read_text(encoding="utf-8"))
    assert loaded["generatedAt"] == payload["generatedAt"]
    assert loaded["universe"] == ["AAPL"]
