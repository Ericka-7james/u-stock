from __future__ import annotations

from bots._shared.filters.chop import ema_separation_pct, slope_pct, passes_chop_filters


def test_ema_separation_pct():
    assert ema_separation_pct(100.0, 100.0, 100.0) == 0.0
    assert ema_separation_pct(101.0, 100.0, 100.0) == 1.0


def test_slope_pct():
    series = [100.0, 101.0, 102.0, 103.0]
    s = slope_pct(series, lookback=2, price=100.0)
    assert s > 0.0


def test_passes_chop_filters():
    assert passes_chop_filters(sep_pct=0.2, slope=0.1, min_sep_pct=0.1, min_slope_pct=0.05) is True
    assert passes_chop_filters(sep_pct=0.05, slope=0.1, min_sep_pct=0.1, min_slope_pct=0.05) is False
    assert passes_chop_filters(sep_pct=0.2, slope=0.01, min_sep_pct=0.1, min_slope_pct=0.05) is False
