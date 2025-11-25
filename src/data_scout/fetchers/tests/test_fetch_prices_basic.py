import pandas as pd
import pytest
from data_scout.fetchers.fetch_prices import fetch_prices_df


def test_fetch_prices_df_empty_list():
    df = fetch_prices_df([])
    assert isinstance(df, pd.DataFrame)
    assert df.empty


def test_fetch_prices_df_monkeypatched(monkeypatch):
    class FakeTicker:
        def __init__(self, symbol):
            self.symbol = symbol

        @property
        def history(self):
            return lambda period="1y", interval="1d": pd.DataFrame({
                "close": [100.0, 101.5],
                "date": pd.to_datetime(["2025-01-01", "2025-01-02"])
            })

    monkeypatch.setattr("data_scout.fetchers.fetch_prices.Ticker", FakeTicker)

    df = fetch_prices_df(["AAPL"])
    assert not df.empty
    assert set(df.columns) == {"ticker", "date", "close"}
    assert (df["ticker"] == "AAPL").all()
