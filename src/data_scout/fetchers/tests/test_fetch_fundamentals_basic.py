import pandas as pd
from data_scout.fetchers.fetch_fundamentals import fetch_fundamentals_df


def test_fetch_fundamentals_empty():
    df = fetch_fundamentals_df([])
    assert isinstance(df, pd.DataFrame)
    assert df.empty


def test_fetch_fundamentals_mock(monkeypatch):
    class FakeTicker:
        def __init__(self, symbol):
            pass

        @property
        def summary_detail(self):
            return {
                "AAPL": {
                    "marketCap": 123,
                    "trailingPE": 10.5,
                }
            }

    monkeypatch.setattr("data_scout.fetchers.fetch_fundamentals.Ticker", FakeTicker)

    df = fetch_fundamentals_df(["AAPL"])
    assert not df.empty
    assert "ticker" in df.columns
    assert "marketCap" in df.columns
