import pytest

from bots._shared.risk.constraints import risk_bounds_ok, risk_pct


def test_risk_pct_entry_zero_or_negative_returns_0():
    assert risk_pct(0, 10) == 0.0
    assert risk_pct(-100, 90) == 0.0


def test_risk_pct_basic_math():
    # abs(entry-stop)/entry * 100
    assert risk_pct(100, 99) == pytest.approx(1.0)
    assert risk_pct(100, 101) == pytest.approx(1.0)
    assert risk_pct(200, 190) == pytest.approx(5.0)


def test_risk_bounds_ok_inclusive_bounds():
    entry = 100
    stop = 99  # 1%
    assert risk_bounds_ok(entry, stop, min_stop_pct=1.0, max_stop_pct=1.0) is True
    assert risk_bounds_ok(entry, stop, min_stop_pct=0.5, max_stop_pct=1.0) is True
    assert risk_bounds_ok(entry, stop, min_stop_pct=1.0, max_stop_pct=2.0) is True


def test_risk_bounds_ok_outside_bounds_false():
    entry = 100
    stop = 99  # 1%
    assert risk_bounds_ok(entry, stop, min_stop_pct=1.01, max_stop_pct=2.0) is False
    assert risk_bounds_ok(entry, stop, min_stop_pct=0.0, max_stop_pct=0.99) is False


def test_risk_bounds_ok_with_non_float_inputs():
    # min/max are cast to float internally
    entry = 100
    stop = 95  # 5%
    assert risk_bounds_ok(entry, stop, min_stop_pct=5, max_stop_pct=5) is True
