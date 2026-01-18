from __future__ import annotations

import math

from bots._shared.indicators.ema import ema


def test_ema_returns_empty_when_length_non_positive():
    assert ema([1, 2, 3], 0) == []
    assert ema([1, 2, 3], -10) == []


def test_ema_returns_empty_when_insufficient_values():
    assert ema([1, 2], 3) == []


def test_ema_output_length_matches_input_length():
    values = [1, 2, 3, 4, 5]
    out = ema(values, 3)
    assert len(out) == len(values)


def test_ema_has_sma_seed_at_index_length_minus_1():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    length = 3
    out = ema(values, length)

    # First length-1 are zeros
    assert out[0] == 0.0
    assert out[1] == 0.0

    # Seed is SMA of first `length` values = (1+2+3)/3 = 2
    assert math.isclose(out[length - 1], 2.0, rel_tol=0, abs_tol=1e-12)


def test_ema_computes_expected_values_simple_case():
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    length = 3

    # k = 2/(3+1) = 0.5
    # seed = 2.0
    # next: 2 + 0.5*(4-2)=3
    # next: 3 + 0.5*(5-3)=4
    expected = [0.0, 0.0, 2.0, 3.0, 4.0]

    out = ema(values, length)
    assert len(out) == len(expected)

    for got, exp in zip(out, expected):
        assert math.isclose(got, exp, rel_tol=0, abs_tol=1e-12)
