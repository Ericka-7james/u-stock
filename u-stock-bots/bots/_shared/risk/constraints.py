from __future__ import annotations


def risk_pct(entry: float, stop: float) -> float:
    if entry <= 0:
        return 0.0
    return abs(entry - stop) / entry * 100.0


def risk_bounds_ok(entry: float, stop: float, *, min_stop_pct: float, max_stop_pct: float) -> bool:
    rp = risk_pct(entry, stop)
    return float(min_stop_pct) <= rp <= float(max_stop_pct)
