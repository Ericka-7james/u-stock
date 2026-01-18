from __future__ import annotations

import math

from bots._shared.indicators.atr import atr


def test_atr_returns_zero_when_n_non_positive():
    h = [10, 11]
    l = [9, 10]
    c = [9.5, 10.5]
    assert atr(h, l, c, n=0) == 0.0
    assert atr(h, l, c, n=-5) == 0.0


def test_atr_returns_zero_when_insufficient_length():
    # Need len >= n+1
    h = [10, 11, 12]
    l = [9, 10, 11]
    c = [9.5, 10.5, 11.5]
    assert atr(h, l, c, n=3) == 0.0  # requires 4


def test_atr_returns_expected_value_simple_case():
    # Construct a case where TR is constant = 1.5
    h = [10.0, 11.0, 12.0, 13.0]
    l = [9.0, 10.0, 11.0, 12.0]
    c = [9.5, 10.5, 11.5, 12.5]

    # TRs:
    # i=1: max(1, |11-9.5|=1.5, |10-9.5|=0.5) = 1.5
    # i=2: 1.5
    # i=3: 1.5
    got = atr(h, l, c, n=3)
    assert math.isclose(got, 1.5, rel_tol=0, abs_tol=1e-9)


def test_atr_uses_last_n_tr_values():
    # Make TR vary so we can verify it averages the last n only
    h = [10, 12, 15, 16, 20]
    l = [9, 10, 11, 12, 13]
    c = [9.5, 11, 14, 15, 19]

    # Compute TRs manually:
    # i=1: max(12-10=2, |12-9.5|=2.5, |10-9.5|=0.5) = 2.5
    # i=2: max(15-11=4, |15-11|=4, |11-11|=0) = 4
    # i=3: max(16-12=4, |16-14|=2, |12-14|=2) = 4
    # i=4: max(20-13=7, |20-15|=5, |13-15|=2) = 7
    trs = [2.5, 4.0, 4.0, 7.0]

    # n=2 should average last 2 = (4 + 7)/2 = 5.5
    got = atr(h, l, c, n=2)
    assert math.isclose(got, (trs[-2] + trs[-1]) / 2.0, rel_tol=0, abs_tol=1e-9)
