from __future__ import annotations

from bots._shared.risk.constraints import risk_pct, risk_bounds_ok
from bots._shared.score.scorecard import weighted_confidence


def test_risk_pct():
    assert abs(risk_pct(100.0, 99.0) - 1.0) < 1e-9
    assert abs(risk_pct(100.0, 101.0) - 1.0) < 1e-9
    assert risk_pct(0.0, 1.0) == 0.0


def test_risk_bounds_ok():
    assert risk_bounds_ok(100.0, 99.5, min_stop_pct=0.1, max_stop_pct=1.0) is True
    assert risk_bounds_ok(100.0, 98.0, min_stop_pct=0.1, max_stop_pct=1.0) is False


def test_weighted_confidence():
    breakdown = {"atr": 1.0, "risk": 0.0, "confirm": 1.0}
    weights = {"atr": 0.5, "risk": 0.25, "confirm": 0.25}
    conf = weighted_confidence(breakdown, weights)
    assert 0.0 <= conf <= 1.0
    assert conf > 0.0
