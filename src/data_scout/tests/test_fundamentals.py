# tests/test_fundamentals.py
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from data_scout import fundamentals as f


def test_fetch_fundamentals_for_ticker_success():
    """It should return a populated dict when yfinance returns info."""
    mock_info = {
        "trailingPE": 29.1,
        "forwardPE": 25.2,
        "priceToBook": 5.4,
        "returnOnEquity": 0.35,
        "returnOnAssets": 0.12,
        "debtToEquity": 1.5,
        "marketCap": 2_800_000_000_000,
        "dividendYield": 0.006,
        "sector": "Technology",
        "industry": "Consumer Electronics",
    }

    with patch.object(f.yf, "Ticker") as MockTicker:
        instance = MockTicker.return_value
        instance.info = mock_info

        result = f.fetch_fundamentals_for_ticker("aapl")

    # TICKER uppercased
    assert result["ticker"] == "AAPL"
    # Fields mapped correctly
    assert result["pe"] == mock_info["trailingPE"]
    assert result["forwardPE"] == mock_info["forwardPE"]
    assert result["pb"] == mock_info["priceToBook"]
    assert result["roe"] == mock_info["returnOnEquity"]
    assert result["roa"] == mock_info["returnOnAssets"]
    assert result["debtToEquity"] == mock_info["debtToEquity"]
    assert result["marketCap"] == mock_info["marketCap"]
    assert result["dividendYield"] == mock_info["dividendYield"]
    assert result["sector"] == mock_info["sector"]
    assert result["industry"] == mock_info["industry"]
    # No error key in success case
    assert "error" not in result


def test_fetch_fundamentals_for_ticker_handles_exception():
    """If yfinance blows up, it should return a dict with Nones + error string."""
    with patch.object(f.yf, "Ticker", side_effect=RuntimeError("boom")):
        result = f.fetch_fundamentals_for_ticker("tsla")

    assert result["ticker"] == "TSLA"
    # All numeric fields should be None
    assert result["pe"] is None
    assert result["forwardPE"] is None
    assert result["pb"] is None
    assert result["roe"] is None
    assert result["roa"] is None
    assert result["debtToEquity"] is None
    assert result["marketCap"] is None
    assert result["dividendYield"] is None
    assert result["sector"] is None
    assert result["industry"] is None
    # Error string captured
    assert "error" in result
    assert "boom" in result["error"]


def test_fetch_fundamentals_snapshot_dedupes_and_uppercases(monkeypatch):
    """Snapshot should dedupe tickers, uppercase them, and call fetch_fundamentals_for_ticker for each."""
    calls: list[str] = []

    def fake_fetch(ticker: str):
        calls.append(ticker)
        return {"ticker": ticker.upper(), "pe": 10.0}

    monkeypatch.setattr(f, "fetch_fundamentals_for_ticker", fake_fetch)

    snapshot = f.fetch_fundamentals_snapshot(["aapl", "AAPL", " tsla "])

    # Universe is uppercased, deduped and sorted
    assert snapshot["universe"] == ["AAPL", "TSLA"]

    # Data length matches universe
    assert len(snapshot["data"]) == 2
    tickers_from_data = sorted(item["ticker"] for item in snapshot["data"])
    assert tickers_from_data == ["AAPL", "TSLA"]

    # Our fake fetch was called once per unique ticker, uppercased
    assert sorted(calls) == ["AAPL", "TSLA"]

    # generatedAt is an ISO 8601 string
    assert "generatedAt" in snapshot
    assert isinstance(snapshot["generatedAt"], str)
    assert "T" in snapshot["generatedAt"]  # coarse but fine for unit test


def test_write_snapshot_writes_json(tmp_path: Path):
    """write_snapshot should create the directory and dump JSON to the file."""
    snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "universe": ["AAPL"],
        "data": [{"ticker": "AAPL", "pe": 29.1}],
    }

    out_file = tmp_path / "public" / "data" / "fundamentals.json"
    f.write_snapshot(snapshot, output_file=out_file)

    assert out_file.exists()

    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded == snapshot


def test_main_uses_default_tickers_and_calls_write_snapshot(monkeypatch):
    """main() should build a snapshot from DEFAULT_TICKERS and pass it to write_snapshot."""
    fake_snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "universe": f.DEFAULT_TICKERS,
        "data": [],
    }

    fake_fetch_snapshot = MagicMock(return_value=fake_snapshot)
    fake_write = MagicMock()

    monkeypatch.setattr(f, "fetch_fundamentals_snapshot", fake_fetch_snapshot)
    monkeypatch.setattr(f, "write_snapshot", fake_write)

    # Call main with no tickers → uses DEFAULT_TICKERS internally
    f.main(tickers=None)

    fake_fetch_snapshot.assert_called_once()
    # It should pass DEFAULT_TICKERS to fetch_fundamentals_snapshot
    args, _ = fake_fetch_snapshot.call_args
    passed_tickers = list(args[0])
    assert passed_tickers == f.DEFAULT_TICKERS

    # write_snapshot should be called with our fake snapshot
    fake_write.assert_called_once_with(fake_snapshot)
