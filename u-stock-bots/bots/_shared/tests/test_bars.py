from __future__ import annotations

from bots._shared.data.bars import extract_ohlc, closes_from_bars


def test_extract_ohlc_returns_none_on_invalid():
    assert extract_ohlc(None) is None
    assert extract_ohlc({}) is None
    assert extract_ohlc({"c": [1, 2, 3]}) is None


def test_extract_ohlc_trims_to_common_length():
    bars = {
        "o": [1, 2, 3, 4],
        "h": [1, 2, 3],
        "l": [1, 2, 3, 4, 5],
        "c": [10, 11, 12, 13],
    }
    o, h, l, c = extract_ohlc(bars)
    assert len(o) == len(h) == len(l) == len(c) == 3
    assert c == [11.0, 12.0, 13.0]


def test_closes_from_bars_safe():
    assert closes_from_bars({"c": [1, 2, 3]}) == [1.0, 2.0, 3.0]
    assert closes_from_bars({"c": ["x", None, 5]}) == [5.0]
    assert closes_from_bars(None) == []
