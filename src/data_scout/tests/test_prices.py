from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from data_scout import prices as p


# --- Helpers ----------------------------------------------------------------------


class DummyFastInfo:
    def __init__(self, last_price: float | None = None, currency: str | None = None):
        self.last_price = last_price
        self.currency = currency


class DummySeries:
    """Minimal stand-in for a pandas Series with iloc[-1] support."""

    def __init__(self, values):
        self._values = list(values)

    @property
    def iloc(self):
        return self

    def __getitem__(self, idx):
        return self._values[idx]


class DummyHist:
    """Minimal stand-in for a pandas DataFrame with 'Close' column."""

    def __init__(self, close_values):
        self._close = DummySeries(close_values)
        self.empty = False

    def __getitem__(self, key):
        assert key == "Close"
        return self._close


# --- Tests for fetch_latest_price -------------------------------------------------


def test_fetch_latest_price_uses_fast_info(monkeypatch):
    """If fast_info has last_price and currency, they should be used."""

    class DummyTicker:
        def __init__(self, ticker: str):
            self.ticker = ticker
            self.fast_info = DummyFastInfo(last_price=123.45, currency="USD")

        def history(self, period: str):
            raise AssertionError("history() should not be called when fast_info is present")

    def fake_ticker(ticker: str):
        return DummyTicker(ticker)

    monkeypatch.setattr(p.yf, "Ticker", fake_ticker)

    result = p.fetch_latest_price("aapl")

    assert result["ticker"] == "AAPL"
    assert result["price"] == pytest.approx(123.45)
    assert result["currency"] == "USD"
    # timestamp should be an ISO string
    assert isinstance(result["timestamp"], str)
    assert "T" in result["timestamp"]
    assert "error" not in result


def test_fetch_latest_price_falls_back_to_history(monkeypatch):
    """
    If fast_info is not present (or has no price), it should fall back to t.history().
    We simulate a ticker with no fast_info attribute and a simple history object.
    """

    class DummyTickerNoFastInfo:
        def __init__(self, ticker: str):
            self.ticker = ticker
            # simulate .info dict with only currency
            self.info = {"currency": "USD"}

        def history(self, period: str):
            assert period == "1d"
            # Last close = 345.67
            return DummyHist([340.0, 345.67])

    def fake_ticker(ticker: str):
        return DummyTickerNoFastInfo(ticker)

    monkeypatch.setattr(p.yf, "Ticker", fake_ticker)

    result = p.fetch_latest_price("tsla")

    assert result["ticker"] == "TSLA"
    assert result["price"] == pytest.approx(345.67)
    # currency should default to "USD" from info dict
    assert result["currency"] == "USD"
    assert isinstance(result["timestamp"], str)
    assert "error" not in result


def test_fetch_latest_price_handles_exception(monkeypatch):
    """If anything blows up, it should return price=None and include an error string."""

    def fake_ticker(ticker: str):
        raise RuntimeError("boom")

    monkeypatch.setattr(p.yf, "Ticker", fake_ticker)

    result = p.fetch_latest_price("spy")

    assert result["ticker"] == "SPY"
    assert result["price"] is None
    assert result["currency"] is None
    assert isinstance(result["timestamp"], str)
    assert "error" in result
    assert "boom" in result["error"]


# --- Tests for fetch_prices_snapshot ----------------------------------------------


def test_fetch_prices_snapshot_dedupes_and_uppercases(monkeypatch):
    """Snapshot should dedupe tickers, uppercase them, and call fetch_latest_price once per unique ticker."""

    calls: list[str] = []

    def fake_fetch(ticker: str):
        calls.append(ticker)
        return {
            "ticker": ticker.upper(),
            "price": 100.0,
            "currency": "USD",
            "timestamp": "2025-11-18T12:00:00Z",
        }

    monkeypatch.setattr(p, "fetch_latest_price", fake_fetch)

    snapshot = p.fetch_prices_snapshot(["aapl", "AAPL", " tsla "])

    # Universe is uppercased, deduped, sorted
    assert snapshot["universe"] == ["AAPL", "TSLA"]

    # Data length matches universe
    assert len(snapshot["data"]) == 2
    tickers_from_data = sorted(item["ticker"] for item in snapshot["data"])
    assert tickers_from_data == ["AAPL", "TSLA"]

    # Our fake fetch was called once per unique ticker, with original case passed in
    assert sorted(calls) == ["AAPL", "TSLA"]

    # generatedAt is an ISO timestamp
    assert "generatedAt" in snapshot
    assert isinstance(snapshot["generatedAt"], str)
    assert "T" in snapshot["generatedAt"]


# --- Tests for write_snapshot -----------------------------------------------------


def test_write_snapshot_writes_json(tmp_path: Path):
    """write_snapshot should create the directory and dump JSON into the file."""
    snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "universe": ["AAPL"],
        "data": [
            {
                "ticker": "AAPL",
                "price": 123.45,
                "currency": "USD",
                "timestamp": "2025-11-18T11:59:00Z",
            }
        ],
    }

    out_file = tmp_path / "public" / "data" / "prices.json"
    p.write_snapshot(snapshot, output_file=out_file)

    assert out_file.exists()

    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded == snapshot


# --- Tests for main ---------------------------------------------------------------


def test_main_uses_default_tickers_and_calls_write_snapshot(monkeypatch):
    """main() should build a snapshot from DEFAULT_TICKERS and pass it to write_snapshot."""
    fake_snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "universe": p.DEFAULT_TICKERS,
        "data": [],
    }

    fake_fetch_snapshot = MagicMock(return_value=fake_snapshot)
    fake_write = MagicMock()

    monkeypatch.setattr(p, "fetch_prices_snapshot", fake_fetch_snapshot)
    monkeypatch.setattr(p, "write_snapshot", fake_write)

    # Call main with no tickers → uses DEFAULT_TICKERS internally
    p.main(tickers=None)

    fake_fetch_snapshot.assert_called_once()
    args, _ = fake_fetch_snapshot.call_args
    passed_tickers = list(args[0])
    assert passed_tickers == p.DEFAULT_TICKERS

    fake_write.assert_called_once_with(fake_snapshot)
