from __future__ import annotations

from typing import Tuple


def rr_targets(entry: float, stop: float, rr: float, side: str) -> Tuple[float, float]:
    """
    Returns (tp, r_value). r_value is abs(entry-stop).

    Production safety:
    - side is validated (buy/sell), case-insensitive
    - rr must be >= 0
    """
    if rr < 0:
        raise ValueError("rr must be >= 0")

    s = (side or "").strip().lower()
    if s not in {"buy", "sell"}:
        raise ValueError(f"side must be 'buy' or 'sell' (got {side!r})")

    r = abs(entry - stop)
    if r <= 0:
        return (entry, r)

    if s == "buy":
        return (entry + r * rr, r)
    return (entry - r * rr, r)
