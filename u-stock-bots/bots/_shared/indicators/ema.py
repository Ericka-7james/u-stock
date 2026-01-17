from __future__ import annotations

from typing import List


def ema(values: List[float], length: int) -> List[float]:
    """
    EMA with SMA seed to reduce early bias.
    Returns list aligned to values length, or [] if insufficient.
    """
    length = int(length)
    if length <= 0:
        return []
    if len(values) < length:
        return []

    k = 2.0 / (length + 1.0)
    seed = sum(values[:length]) / float(length)

    out: List[float] = [0.0] * (length - 1) + [seed]
    prev = seed
    for v in values[length:]:
        prev = prev + k * (v - prev)
        out.append(prev)
    return out
