from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, List
import pytest

import bots.ema_trend.bot as bot_mod
from bots.ema_trend.config import EMATrendConfig


class FakeAPI:
    """
    Fake API that returns pre-programmed responses for api.get(path, params=...).
    """

    def __init__(self):
        self.calls: List[Tuple[str, Dict[str, Any]]] = []
        self.responses: Dict[str, Any] = {}

    def set(self, key: str, value: Any) -> None:
        self.responses[key] = value

    def get(self, path: str, params: Optional[Dict[str, Any]] = None):
        self.calls.append((path, dict(params or {})))

        if path == "/api/market/us/bars":
            sym = (params or {}).get("symbol")
            tf = (params or {}).get("timeframe")
            key = f"{path}|{sym}|{tf}"
            return self.responses.get(key, {"bars": {}})

        return self.responses.get(path)


def _bars(*, o, h, l, c):
    return {"bars": {"o": list(o), "h": list(h), "l": list(l), "c": list(c)}}


def _bias_closes_up(n=70, start=100.0):
    return [start + i * 0.5 for i in range(n)]


def _bias_closes_down(n=70, start=150.0):
    return [start - i * 0.5 for i in range(n)]


def _entry_bars_ok(n=80, start=100.0, step=0.02):
    # trending bars with reclaim candle at end
    c = [start + i * step for i in range(n)]
    o = c[:]
    h = [x + 0.15 for x in c]
    l = [x - 0.15 for x in c]
    o[-1] = c[-2]
    l[-1] = c[-1] - 0.25
    return _bars(o=o, h=h, l=l, c=c)


@pytest.fixture(autouse=True)
def _reset_globals():
    bot_mod._LAST_LOG_TS.clear()
    bot_mod._MARKET_CLOSED_UNTIL = 0.0
    yield
    bot_mod._LAST_LOG_TS.clear()
    bot_mod._MARKET_CLOSED_UNTIL = 0.0


def test_run_returns_empty_outside_trade_window(monkeypatch):
    api = FakeAPI()
    api.set("/api/opportunities", {"symbols": ["AAPL"]})

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: False)

    out = bot_mod.run(api=api, cfg=EMATrendConfig())
    assert out == []


def test_run_returns_empty_when_opportunities_fails(monkeypatch):
    api = FakeAPI()

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: True)

    def boom(*args, **kwargs):
        raise RuntimeError("nope")

    monkeypatch.setattr(api, "get", boom)

    out = bot_mod.run(api=api, cfg=EMATrendConfig())
    assert out == []


def test_run_returns_empty_when_no_symbols(monkeypatch):
    api = FakeAPI()
    api.set("/api/opportunities", {"symbols": []})

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: True)

    out = bot_mod.run(api=api, cfg=EMATrendConfig())
    assert out == []


def test_run_skips_when_bias_cannot_be_computed(monkeypatch):
    api = FakeAPI()
    api.set("/api/opportunities", {"symbols": ["AAPL"]})

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: True)

    # Too few bias closes to compute EMA50 + slope lookback
    api.set("/api/market/us/bars|AAPL|15Min", {"bars": {"c": [100.0] * 10}})

    cfg = EMATrendConfig()
    out = bot_mod.run(api=api, cfg=cfg)
    assert out == []


def test_run_chop_filter_blocks(monkeypatch):
    api = FakeAPI()
    api.set("/api/opportunities", {"symbols": ["AAPL"]})

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: True)

    # Bias closes valid (up)
    api.set("/api/market/us/bars|AAPL|15Min", {"bars": {"c": _bias_closes_up()}})

    # Entry bars: flat -> will fail chop filters if strict
    n = 80
    c = [100.0] * n
    o = c[:]
    h = [100.01] * n
    l = [99.99] * n
    api.set("/api/market/us/bars|AAPL|1Min", _bars(o=o, h=h, l=l, c=c))

    cfg = EMATrendConfig(min_sep_pct=0.50, min_slope_pct=0.50)  # force fail
    out = bot_mod.run(api=api, cfg=cfg)
    assert out == []


def test_run_selects_top_n_by_confidence(monkeypatch):
    api = FakeAPI()
    api.set("/api/opportunities", {"symbols": ["AAA", "BBB", "CCC", "DDD"]})

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: True)

    # Everyone has valid bias bars
    for sym in ["AAA", "BBB", "CCC", "DDD"]:
        api.set(f"/api/market/us/bars|{sym}|15Min", {"bars": {"c": _bias_closes_up()}})
        api.set(f"/api/market/us/bars|{sym}|1Min", _entry_bars_ok())

    # Make chop filters non-blocking for this test
    cfg = EMATrendConfig(min_sep_pct=0.0, min_slope_pct=0.0, max_intents_per_run=2, min_confidence=0.0)

    # Patch compute_signal so we can control confidence ranking
    conf_map = {"AAA": 0.10, "BBB": 0.90, "CCC": 0.50, "DDD": 0.80}

    def fake_compute_signal(bars_entry, cfg_obj, bias):
        # symbol is inside the API calls; easiest: infer from last call to /api/market/us/bars
        # We'll just return a generic triple and reasons with a confidence based on the last symbol in calls.
        # In this loop, compute_signal is called after the entry bars request for that symbol.
        last_path, last_params = api.calls[-1]
        sym = last_params.get("symbol")
        return (100.0, 99.5, 101.0), ["X_REASON"], conf_map.get(sym, 0.0)

    monkeypatch.setattr(bot_mod, "compute_signal", fake_compute_signal)

    out = bot_mod.run(api=api, cfg=cfg)

    assert len(out) == 2
    # Expect top 2: BBB (0.90), DDD (0.80)
    syms = [i.symbol for i in out]
    assert syms == ["BBB", "DDD"]


def test_market_gate_is_set_when_no_symbol_has_bias_data(monkeypatch):
    api = FakeAPI()
    api.set("/api/opportunities", {"symbols": ["AAPL", "MSFT"]})

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: True)

    # Bias bars empty => any_symbol_had_data stays False
    api.set("/api/market/us/bars|AAPL|15Min", {"bars": {"c": []}})
    api.set("/api/market/us/bars|MSFT|15Min", {"bars": {"c": []}})

    # Force market closed return
    monkeypatch.setattr(bot_mod, "_maybe_market_closed", lambda _api: (True, 9999999999.0, "test"))
    monkeypatch.setattr(bot_mod, "_write_market_gate_hint", lambda until: None)

    out = bot_mod.run(api=api, cfg=EMATrendConfig())
    assert out == []
    assert bot_mod._MARKET_CLOSED_UNTIL == 9999999999.0


def test_market_gate_skips_immediately_when_active(monkeypatch):
    api = FakeAPI()
    api.set("/api/opportunities", {"symbols": ["AAPL"]})

    monkeypatch.setattr(bot_mod, "is_trade_window_local", lambda: True)

    bot_mod._MARKET_CLOSED_UNTIL = 9999999999.0

    out = bot_mod.run(api=api, cfg=EMATrendConfig())
    assert out == []
    # Gate returns early: should not call opportunities
    assert api.calls == []
