from __future__ import annotations

from typing import Tuple


def rr_targets(entry: float, stop: float, rr: float, side: str) -> Tuple[float, float]:
    """
    Returns (tp, r_value). r_value is abs(entry-stop).
    """
    r = abs(entry - stop)
    if r <= 0:
        return (entry, r)

    if side == "buy":
        return (entry + r * rr, r)
    return (entry - r * rr, r)
