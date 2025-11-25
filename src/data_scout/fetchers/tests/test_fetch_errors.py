# src/data_scout/fetchers/tests/test_fetch_errors.py

import pandas as pd

from data_scout.fetchers.fetch_intraday import fetch_intraday_df
from data_scout.fetchers.fetch_prices import fetch_prices_df


def test_fetch_intraday_empty_symbols():
    """
    When symbols list is empty, intraday fetcher should return
    an empty DataFrame (correct shape, no rows).
    """
    df = fetch_intraday_df([], period="5d", interval="5m")
    assert isinstance(df, pd.DataFrame)
    assert df.empty


def test_fetch_prices_empty_symbol_list():
    """
    When symbols list is empty, prices fetcher should return
    an empty DataFrame (correct shape, no rows).
    """
    df = fetch_prices_df([])
    assert isinstance(df, pd.DataFrame)
    assert df.empty
