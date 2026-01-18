from __future__ import annotations

import pytest

from runner import registry


def test_registry_register_and_get():
    registry.REGISTRY.clear()

    def fn(api, cfg):
        return {"intents": [], "events": []}

    registry.register("EMA_TREND", fn)

    got = registry.get("ema_trend")
    assert got is fn


def test_registry_get_raises_for_missing():
    registry.REGISTRY.clear()
    with pytest.raises(KeyError):
        registry.get("missing_bot")
