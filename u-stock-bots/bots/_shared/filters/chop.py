from __future__ import annotations

from typing import List


def ema_separation_pct(ema_fast: float, ema_slow: float, price: float) -> float:
    if price <= 0:
        return 0.0
    return abs(ema_fast - ema_slow) / price * 100.0


def slope_pct(series: List[float], lookback: int, price: float) -> float:
    if price <= 0 or len(series) <= lookback:
        return 0.0
    a = series[-1]
    b = series[-1 - int(lookback)]
    return (a - b) / price * 100.0


def passes_chop_filters(
    *,
    sep_pct: float,
    slope: float,
    min_sep_pct: float,
    min_slope_pct: float,
) -> bool:
    """
    Require EMA separation and EMA slope strength.
    """
    return (sep_pct >= float(min_sep_pct)) and (abs(slope) >= float(min_slope_pct))
