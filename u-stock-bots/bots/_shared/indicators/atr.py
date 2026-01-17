from __future__ import annotations

from typing import List


def atr(h: List[float], l: List[float], c: List[float], n: int = 14) -> float:
    """
    Simple ATR (SMA of TR over last n).
    Returns 0.0 if insufficient/invalid.
    """
    n = int(n)
    if n <= 0:
        return 0.0
    if len(c) < n + 1 or len(h) < n + 1 or len(l) < n + 1:
        return 0.0

    trs: List[float] = []
    for i in range(1, len(c)):
        tr = max(
            h[i] - l[i],
            abs(h[i] - c[i - 1]),
            abs(l[i] - c[i - 1]),
        )
        trs.append(float(tr))

    return sum(trs[-n:]) / float(n)
