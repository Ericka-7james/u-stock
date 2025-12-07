# tests/data_layer/test_types_and_providers.py
from __future__ import annotations

from typing import get_type_hints, Literal

from data_scout.data_layer.types import PriceInterval, Candle
from data_scout.data_layer.providers.base import PriceDataProvider
from data_scout.data_layer.providers.yahoo_provider import YahooPriceDataProvider

try:
    from data_scout.data_layer.providers.alpaca_provider import AlpacaPriceDataProvider
except Exception:  # ImportError or missing deps
    AlpacaPriceDataProvider = None  # type: ignore[assignment]

try:
    from data_scout.data_layer.providers.polygon_provider import PolygonPriceDataProvider
except Exception:
    PolygonPriceDataProvider = None  # type: ignore[assignment]


def test_price_interval_literal_contains_expected_values():
    # PriceInterval should be a Literal containing these values
    assert isinstance(PriceInterval, type(Literal["1m"]))  # type: ignore[arg-type]

    allowed = set(getattr(PriceInterval, "__args__", ()))
    for v in ["1m", "5m", "15m", "1h", "1d"]:
        assert v in allowed


def test_candle_has_expected_keys():
    # Candle is a TypedDict; at runtime we only see __annotations__
    keys = set(Candle.__annotations__.keys())
    assert keys == {"symbol", "timestamp", "open", "high", "low", "close", "volume"}


def _assert_interval_annotation_is_priceinterval(cls, method_name: str):
    hints = get_type_hints(getattr(cls, method_name))
    assert "interval" in hints
    assert hints["interval"] is PriceInterval


def test_base_provider_uses_priceinterval_annotations():
    _assert_interval_annotation_is_priceinterval(PriceDataProvider, "fetch_history")
    _assert_interval_annotation_is_priceinterval(PriceDataProvider, "fetch_latest")


def test_yahoo_provider_uses_priceinterval_annotations():
    _assert_interval_annotation_is_priceinterval(YahooPriceDataProvider, "fetch_history")
    # fetch_latest may also use PriceInterval explicitly
    _assert_interval_annotation_is_priceinterval(YahooPriceDataProvider, "fetch_latest")


import pytest


@pytest.mark.skipif(AlpacaPriceDataProvider is None, reason="Alpaca provider not available")
def test_alpaca_provider_uses_priceinterval_annotations():
    _assert_interval_annotation_is_priceinterval(AlpacaPriceDataProvider, "fetch_history")
    _assert_interval_annotation_is_priceinterval(AlpacaPriceDataProvider, "fetch_latest")


@pytest.mark.skipif(PolygonPriceDataProvider is None, reason="Polygon provider not available")
def test_polygon_provider_uses_priceinterval_annotations():
    _assert_interval_annotation_is_priceinterval(PolygonPriceDataProvider, "fetch_history")
    _assert_interval_annotation_is_priceinterval(PolygonPriceDataProvider, "fetch_latest")
