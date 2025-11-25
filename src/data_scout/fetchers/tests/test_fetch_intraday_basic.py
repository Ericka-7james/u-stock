import pandas as pd
from data_scout.fetchers.fetch_intraday import fetch_intraday_df


def test_fetch_intraday_df_empty():
    df = fetch_intraday_df([], period="5d", interval="5m")
    assert isinstance(df, pd.DataFrame)
    assert df.empty


def test_fetch_intraday_df_mock(monkeypatch):
    class FakeTicker:
        def __init__(self, symbols):
            pass

        def history(self, period="5d", interval="5m"):
            return pd.DataFrame({
                "symbol": ["AAPL", "AAPL"],
                "date": pd.to_datetime(["2025-01-01 09:30", "2025-01-01 09:35"]),
                "open": [100, 101],
                "high": [101, 102],
                "low": [99, 100],
                "close": [100.5, 101.5],
                "volume": [1000, 1200],
            })

    monkeypatch.setattr("data_scout.fetchers.fetch_intraday.Ticker", FakeTicker)

    df = fetch_intraday_df(["AAPL"], period="5d", interval="5m")
    assert not df.empty
    assert "symbol" in df.columns
    assert "date" in df.columns
