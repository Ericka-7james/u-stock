import pytest

from bots._shared.risk.targets import rr_targets


def test_rr_targets_r_value_is_abs_entry_minus_stop():
    tp, r = rr_targets(entry=100, stop=98, rr=2, side="buy")
    assert r == pytest.approx(2.0)
    assert tp == pytest.approx(104.0)


def test_rr_targets_buy():
    tp, r = rr_targets(entry=100, stop=95, rr=1.5, side="buy")
    assert r == pytest.approx(5.0)
    assert tp == pytest.approx(107.5)


def test_rr_targets_sell():
    tp, r = rr_targets(entry=100, stop=105, rr=2, side="sell")
    assert r == pytest.approx(5.0)
    assert tp == pytest.approx(90.0)


def test_rr_targets_zero_r_returns_entry():
    tp, r = rr_targets(entry=100, stop=100, rr=2, side="buy")
    assert r == pytest.approx(0.0)
    assert tp == pytest.approx(100.0)
