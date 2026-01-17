from __future__ import annotations

from typing import Dict

from bots._shared.scoring import clamp01


def weighted_confidence(breakdown: Dict[str, float], weights: Dict[str, float]) -> float:
    total = 0.0
    wsum = 0.0
    for k, v in breakdown.items():
        w = float(weights.get(k, 0.0))
        total += float(v) * w
        wsum += w
    if wsum <= 0:
        return 0.0
    return clamp01(total / wsum)
