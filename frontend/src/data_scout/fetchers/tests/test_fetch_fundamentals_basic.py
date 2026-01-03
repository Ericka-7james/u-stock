"""
Tests for data_scout.fetchers.fetch_fundamentals

Goals:
- Hit pick_keys.
- Hit fetch_company_fundamentals_slim:
    * empty symbols
    * Ticker constructor error
    * full happy path with batched fundamentals + institutional ownership
- Hit save_fundamentals_to_json (empty + non-empty-ish).
- Hit save_fundamentals_parquet without requiring a real parquet engine.
- Hit main() for both branches:
    * df_flat.empty -> no parquet
    * non-empty df_flat -> parquet called
"""

from __future__ import annotations

import json
import builtins  # ✅ NEW: so we can patch the real print()
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd
import pytest

from data_scout.fetchers import fetch_fundamentals as fundamentals_module


# ---------- pick_keys --------------------------------------------------------


def test_pick_keys_basic():
    source = {"a": 1, "b": 2, "c": 3}
    result = fundamentals_module.pick_keys(source, ["a", "c", "missing"])
    # Only keys present in source AND requested
    assert result == {"a": 1, "c": 3}
    assert "missing" not in result


# ---------- fetch_company_fundamentals_slim: edge + error paths -------------


def test_fetch_company_fundamentals_slim_empty_symbols():
    # When no symbols are passed, we should get empty structures.
    nested, df = fundamentals_module.fetch_company_fundamentals_slim([])
    assert nested == {}
    assert isinstance(df, pd.DataFrame)
    assert df.empty


def test_fetch_company_fundamentals_slim_ticker_constructor_error(monkeypatch: pytest.MonkeyPatch):
    # Ticker(...) raises -> function should catch & return empty structures.
    class FakeTickerRaises:
        def __init__(self, symbols: List[str]) -> None:
            raise RuntimeError("boom in constructor")

    monkeypatch.setattr(fundamentals_module, "Ticker", FakeTickerRaises)

    nested, df = fundamentals_module.fetch_company_fundamentals_slim(["AAPL", "MSFT"])
    assert nested == {}
    assert isinstance(df, pd.DataFrame)
    assert df.empty


# ---------- fetch_company_fundamentals_slim: happy path with fake data ------


class _FakeTickerFundamentals:
    """
    Single fake class used for both batched and per-symbol Ticker calls.

    Behavior:
      - When constructed with a list of symbols:
          * asset_profile, key_stats, financial_data, summary_detail
            each return a dict keyed by symbol.
      - When constructed with a single symbol (str):
          * institution_ownership returns a list of dicts so that the
            code path that calls `.to_dict("records")` and falls back
            on AttributeError is exercised.
    """

    def __init__(self, symbols: Any) -> None:
        self._symbols = symbols

    # ---- Batched endpoints (dict keyed by symbol) ----

    @property
    def asset_profile(self) -> Dict[str, Dict[str, Any]]:
        if isinstance(self._symbols, list):
            return {
                "AAPL": {
                    "sector": "Technology",
                    "industry": "Consumer Electronics",
                    "country": "US",
                    "website": "https://apple.com",
                    "longBusinessSummary": "Apple makes devices.",
                    "fullTimeEmployees": 100000,
                },
                "MSFT": {
                    "sector": "Technology",
                    "industry": "Software—Infrastructure",
                    "country": "US",
                    "website": "https://microsoft.com",
                    "longBusinessSummary": "Microsoft makes software.",
                    "fullTimeEmployees": 120000,
                },
            }
        return {}

    @property
    def key_stats(self) -> Dict[str, Dict[str, Any]]:
        if isinstance(self._symbols, list):
            return {
                "AAPL": {
                    "beta": 1.2,
                    "bookValue": 5.0,
                    "priceToBook": 30.0,
                    "52WeekChange": 0.1,
                    "heldPercentInstitutions": 0.6,
                    "sharesOutstanding": 1_000_000_000,
                    "trailingPE": 20.0,
                    "forwardPE": 18.0,
                    "enterpriseValue": 2_000_000_000,
                    "enterpriseToEbitda": 15.0,
                    "enterpriseToRevenue": 5.0,
                    "floatShares": 900_000_000,
                    "sharesShort": 10_000_000,
                    "sharesShortPriorMonth": 9_000_000,
                    "shortRatio": 1.2,
                    "shortPercentOfFloat": 0.01,
                    "sharesPercentSharesOut": 0.02,
                },
                "MSFT": {
                    "beta": 1.1,
                    "bookValue": 10.0,
                    "priceToBook": 25.0,
                    "52WeekChange": 0.15,
                    "heldPercentInstitutions": 0.7,
                    "sharesOutstanding": 2_000_000_000,
                    "trailingPE": 22.0,
                    "forwardPE": 19.0,
                    "enterpriseValue": 3_000_000_000,
                    "enterpriseToEbitda": 16.0,
                    "enterpriseToRevenue": 6.0,
                    "floatShares": 1_900_000_000,
                    "sharesShort": 20_000_000,
                    "sharesShortPriorMonth": 18_000_000,
                    "shortRatio": 1.3,
                    "shortPercentOfFloat": 0.02,
                    "sharesPercentSharesOut": 0.03,
                },
            }
        return {}

    @property
    def financial_data(self) -> Dict[str, Dict[str, Any]]:
        if isinstance(self._symbols, list):
            return {
                "AAPL": {
                    "currentPrice": 180.0,
                    "totalRevenue": 300_000_000_000,
                    "revenueGrowth": 0.05,
                    "grossMargins": 0.4,
                    "operatingMargins": 0.3,
                    "profitMargins": 0.25,
                    "debtToEquity": 1.1,
                    "freeCashflow": 10_000_000_000,
                },
                "MSFT": {
                    "currentPrice": 350.0,
                    "totalRevenue": 250_000_000_000,
                    "revenueGrowth": 0.06,
                    "grossMargins": 0.5,
                    "operatingMargins": 0.35,
                    "profitMargins": 0.28,
                    "debtToEquity": 0.5,
                    "freeCashflow": 15_000_000_000,
                },
            }
        return {}

    @property
    def summary_detail(self) -> Dict[str, Dict[str, Any]]:
        if isinstance(self._symbols, list):
            return {
                "AAPL": {
                    "dividendYield": 0.005,
                    "dividendRate": 0.9,
                    "payoutRatio": 0.2,
                    "marketCap": 3_000_000_000_000,
                    "regularMarketVolume": 100_000_000,
                    "averageVolume": 90_000_000,
                    "averageDailyVolume10Day": 95_000_000,
                    "regularMarketPreviousClose": 179.0,
                    "regularMarketOpen": 180.0,
                    "regularMarketDayHigh": 182.0,
                    "regularMarketDayLow": 178.0,
                },
                "MSFT": {
                    "dividendYield": 0.006,
                    "dividendRate": 1.0,
                    "payoutRatio": 0.25,
                    "marketCap": 2_800_000_000_000,
                    "regularMarketVolume": 80_000_000,
                    "averageVolume": 75_000_000,
                    "averageDailyVolume10Day": 77_000_000,
                    "regularMarketPreviousClose": 348.0,
                    "regularMarketOpen": 350.0,
                    "regularMarketDayHigh": 352.0,
                    "regularMarketDayLow": 347.0,
                },
            }
        return {}

    # ---- Per-symbol endpoint used in loop: institution_ownership ------------

    @property
    def institution_ownership(self):
        if isinstance(self._symbols, str):
            # Return a list (not a DataFrame) so that the code's attempt to call
            # `.to_dict("records")` raises AttributeError, and then it falls back
            # to using this list directly.
            return [
                {
                    "organization": "Big Fund 1",
                    "pctHeld": 0.05,
                    "position": 10_000_000,
                    "value": 1_800_000_000,
                    "extraFieldIgnored": "foo",
                },
                {
                    "organization": "Big Fund 2",
                    "pctHeld": 0.03,
                    "position": 6_000_000,
                    "value": 1_080_000_000,
                },
            ]
        return None


def test_fetch_company_fundamentals_slim_happy_path(monkeypatch: pytest.MonkeyPatch):
    # Patch Ticker so we never hit the real network.
    monkeypatch.setattr(fundamentals_module, "Ticker", _FakeTickerFundamentals)

    symbols = ["AAPL", "MSFT"]
    nested, df_flat = fundamentals_module.fetch_company_fundamentals_slim(symbols)

    # --- nested JSON-like structure ---
    assert set(nested.keys()) == {"AAPL", "MSFT"}

    for sym in symbols:
        entry = nested[sym]
        # Top-level sections exist
        for section in [
            "company_profile",
            "key_stats",
            "financial_data",
            "dividends",
            "trading_snapshot",
            "institution_ownership",
        ]:
            assert section in entry

        # Institution ownership should be a list of up to 5 holders
        inst = entry["institution_ownership"]
        assert isinstance(inst, list)
        assert 1 <= len(inst) <= 5
        # Each holder only keeps slim keys
        for holder in inst:
            assert set(holder.keys()) <= {"organization", "pctHeld", "position", "value"}

    # --- flattened DataFrame ---
    assert isinstance(df_flat, pd.DataFrame)
    assert len(df_flat) == 2
    assert set(df_flat["symbol"]) == {"AAPL", "MSFT"}

    # Spot-check a few flattened columns
    expected_cols = [
        "sector",
        "industry",
        "country",
        "beta",
        "bookValue",
        "priceToBook",
        "currentPrice",
        "totalRevenue",
        "dividendYield",
        "marketCap",
        "regularMarketVolume",
    ]
    for col in expected_cols:
        assert col in df_flat.columns

    # Values should match our fake data for at least one symbol
    aapl_row = df_flat[df_flat["symbol"] == "AAPL"].iloc[0]
    assert aapl_row["sector"] == "Technology"
    assert aapl_row["currentPrice"] == 180.0
    assert aapl_row["marketCap"] == 3_000_000_000_000


# ---------- save_fundamentals_to_json ---------------------------------------


def test_save_fundamentals_to_json_writes_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(fundamentals_module, "get_project_root", lambda: tmp_path)

    data = {
        "AAPL": {"key_stats": {"beta": 1.2}},
        "MSFT": {"key_stats": {"beta": 1.1}},
    }

    out_path = fundamentals_module.save_fundamentals_to_json(data, filename="fundamentals-test.json")
    assert out_path.exists()

    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert set(payload["symbols"]) == {"AAPL", "MSFT"}
    assert payload["data"]["AAPL"]["key_stats"]["beta"] == 1.2


def test_save_fundamentals_to_json_empty(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(fundamentals_module, "get_project_root", lambda: tmp_path)

    data: Dict[str, Any] = {}
    out_path = fundamentals_module.save_fundamentals_to_json(data, filename="fundamentals-empty.json")
    assert out_path.exists()

    payload = json.loads(out_path.read_text(encoding="utf-8"))
    assert payload["symbols"] == []
    assert payload["data"] == {}


# ---------- save_fundamentals_parquet ---------------------------------------


class _DummyDF:
    """
    Dummy object mimicking a DataFrame with a to_parquet method, so that
    we don't require pyarrow/fastparquet to be installed during tests.
    """

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []

    def to_parquet(self, path: Path, index: bool = False) -> None:
        # Record the call but do not actually write anything.
        self.calls.append({"path": str(path), "index": index})


def test_save_fundamentals_parquet_uses_to_parquet(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(fundamentals_module, "get_project_root", lambda: tmp_path)

    dummy_df = _DummyDF()
    out_path = fundamentals_module.save_fundamentals_parquet(dummy_df, filename="fundamentals_slim_test.parquet")

    # We expect one call to to_parquet with index=False
    assert len(dummy_df.calls) == 1
    call = dummy_df.calls[0]
    assert call["index"] is False
    assert out_path.name == "fundamentals_slim_test.parquet"
    # Path should be under public/data/pandas
    assert "public" in call["path"]
    assert "data" in call["path"]
    assert "pandas" in call["path"]


# ---------- main() coverage -------------------------------------------------


def test_main_with_non_empty_df_triggers_both_saves(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """
    Exercise main() where df_flat is non-empty -> both JSON + Parquet savers called.
    """
    monkeypatch.setattr(fundamentals_module, "get_project_root", lambda: tmp_path)

    # Fake fetch that returns a non-empty nested dict + non-empty df
    def fake_fetch_company_fundamentals_slim(symbols: List[str]):
        nested = {"AAPL": {"company_profile": {"sector": "Technology"}}}
        df_flat = pd.DataFrame([{"symbol": "AAPL", "sector": "Technology"}])
        return nested, df_flat

    monkeypatch.setattr(
        fundamentals_module,
        "fetch_company_fundamentals_slim",
        fake_fetch_company_fundamentals_slim,
    )

    calls = {"json": 0, "parquet": 0}

    def fake_save_json(data, filename="fundamentals-slim.json"):
        calls["json"] += 1
        return tmp_path / filename

    def fake_save_parquet(df, filename="fundamentals_slim.parquet"):
        calls["parquet"] += 1
        return tmp_path / filename

    monkeypatch.setattr(fundamentals_module, "save_fundamentals_to_json", fake_save_json)
    monkeypatch.setattr(fundamentals_module, "save_fundamentals_parquet", fake_save_parquet)

    # 👈 patch the real built-in print, not fundamentals_module.print
    monkeypatch.setattr(builtins, "print", lambda *args, **kwargs: None)

    fundamentals_module.main()

    assert calls["json"] == 1
    assert calls["parquet"] == 1


def test_main_with_empty_df_skips_parquet(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """
    Exercise main() where df_flat is empty -> JSON save only, no parquet.
    """
    monkeypatch.setattr(fundamentals_module, "get_project_root", lambda: tmp_path)

    # Fake fetch that returns nested dict + empty DataFrame
    def fake_fetch_empty(symbols: List[str]):
        nested = {"AAPL": {"company_profile": {"sector": "Technology"}}}
        df_flat = pd.DataFrame()  # empty
        return nested, df_flat

    monkeypatch.setattr(
        fundamentals_module,
        "fetch_company_fundamentals_slim",
        fake_fetch_empty,
    )

    calls = {"json": 0, "parquet": 0}

    def fake_save_json(data, filename="fundamentals-slim.json"):
        calls["json"] += 1
        return tmp_path / filename

    def fake_save_parquet(df, filename="fundamentals_slim.parquet"):
        calls["parquet"] += 1
        return tmp_path / filename

    monkeypatch.setattr(fundamentals_module, "save_fundamentals_to_json", fake_save_json)
    monkeypatch.setattr(fundamentals_module, "save_fundamentals_parquet", fake_save_parquet)

    # 👈 again: patch builtins.print instead of module.print
    monkeypatch.setattr(builtins, "print", lambda *args, **kwargs: None)

    fundamentals_module.main()

    assert calls["json"] == 1
    assert calls["parquet"] == 0
