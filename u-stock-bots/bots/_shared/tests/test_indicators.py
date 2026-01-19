from __future__ import annotations

from bots._shared.indicators.ema import ema
from bots._shared.indicators.atr import atr


def test_ema_empty_when_insufficient():
    assert ema([1, 2, 3], 5) == []
    assert ema([], 1) == []
    assert ema([1, 2], 0) == []


def test_ema_aligns_length():
    vals = [1.0] * 20
    out = ema(vals, 9)
    assert len(out) == len(vals)
    # seeded EMA appears at index length-1
    assert out[0] == 0.0
    assert out[7] == 0.0
    assert out[8] != 0.0


def test_atr_zero_when_insufficient():
    h = [1, 1, 1]
    l = [1, 1, 1]
    c = [1, 1, 1]
    assert atr(h, l, c, n=14) == 0.0


def test_atr_positive_on_range():
    n = 20
    c = [100 + i for i in range(n)]
    h = [x + 1 for x in c]
    l = [x - 1 for x in c]
    assert atr(h, l, c, n=14) > 0.0
