import pytest

from bots._shared.score.scorecard import weighted_confidence


def test_weighted_confidence_returns_0_when_no_weights_match():
    breakdown = {"a": 1.0, "b": 0.5}
    weights = {"x": 1.0, "y": 2.0}
    assert weighted_confidence(breakdown, weights) == 0.0


def test_weighted_confidence_returns_0_when_weights_sum_to_zero():
    breakdown = {"a": 1.0}
    weights = {"a": 0.0}
    assert weighted_confidence(breakdown, weights) == 0.0


def test_weighted_confidence_basic_weighted_average():
    breakdown = {"a": 0.8, "b": 0.2}
    weights = {"a": 3.0, "b": 1.0}
    assert weighted_confidence(breakdown, weights) == pytest.approx(0.65)


def test_weighted_confidence_ignores_unweighted_keys():
    breakdown = {"a": 0.9, "b": 0.1, "c": 0.0}
    weights = {"a": 1.0, "b": 1.0}
    assert weighted_confidence(breakdown, weights) == pytest.approx(0.5)


def test_weighted_confidence_clamps_to_0_1_upper():
    breakdown = {"a": 10.0}
    weights = {"a": 1.0}
    assert weighted_confidence(breakdown, weights) == 1.0


def test_weighted_confidence_clamps_to_0_1_lower():
    breakdown = {"a": -5.0}
    weights = {"a": 1.0}
    assert weighted_confidence(breakdown, weights) == 0.0


def test_weighted_confidence_casts_inputs_to_float():
    breakdown = {"a": 1, "b": 0.0}
    weights = {"a": "2", "b": 2}
    assert weighted_confidence(breakdown, weights) == pytest.approx(0.5)
