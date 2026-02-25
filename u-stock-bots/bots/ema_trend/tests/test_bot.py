# u-stock-bots/bots/ema_trend/tests/test_bot.py
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, List
import pytest

import bots.ema_trend.bot as bot_mod
from bots.ema_trend.config import EMATrendConfig


class FakeAPI:
    """
    Fake API that returns pre-programmed responses for api.get(path, params=...).

    This bot calls:
      GET /api/market/bars  params={symbol, tf, limit, feed?}
    """

    def __init__(self):
        self.calls: List[Tuple[str, Dict[str, Any]]] = []
        self.responses: Dict[str, Any] = {}

    def set(self, key: str, value: Any) -> None:
        self.responses[key] = value

    def get(self, path: str, params: Optional[Dict[str, Any]] = None):
        p = dict(params or {})
        self.calls.append((path, p))

        # Match the current bot implementation
        if path == "/api/market/bars":
            sym = (p.get("symbol") or "").upper()
            tf = p.get("tf")
            key = f"{path}|{sym}|{tf}"
            return self.responses.get(key, None)

        return self.responses.get(path, None)


def _bars(*, o, h, l, c):
    # Shape compatible with extract_ohlc()
    return {"bars": {"o": list(o), "h": list(h), "l": list(l), "c": list(c)}}


def _closes_up(n=70, start=100.0, step=0.5):
    return [start + i * step for i in range(n)]


def _ohlc_from_closes(c: List[float]) -> Dict[str, Any]:
    o = c[:]
    h = [x + 0.15 for x in c]
    l = [x - 0.15 for x in c]
    if len(c) >= 2:
        o[-1] = c[-2]
        l[-1] = c[-1] - 0.25
    return _bars(o=o, h=h, l=l, c=c)


def _seed_bars(api: FakeAPI, *, sym: str, tf: str, closes: List[float]) -> None:
    api.set(f"/api/market/bars|{sym.upper()}|{tf}", _ohlc_from_closes(closes))


@pytest.fixture(autouse=True)
def _reset_debug(monkeypatch: pytest.MonkeyPatch):
    # Keep tests deterministic regardless of environment
    monkeypatch.setattr(bot_mod, "_STRAT_DEBUG", False, raising=False)
    yield


def test_compute_returns_empty_when_no_symbols():
    api = FakeAPI()
    out = bot_mod.compute(api=api, bot_id="ema_trend", cfg_dict={})
    assert out == {"intents": [], "events": []}
    assert api.calls == []


def test_compute_returns_empty_when_qty_is_non_positive():
    api = FakeAPI()
    out = bot_mod.compute(api=api, bot_id="ema_trend", cfg_dict={"symbols": ["AAPL"], "qty": 0})
    assert out == {"intents": [], "events": []}
    assert api.calls == []  # qty gate happens before fetching bars


def test_compute_skips_when_missing_bars_and_stays_quiet_when_debug_off():
    api = FakeAPI()

    # Provide bias bars but NOT entry bars -> should skip and stay quiet
    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(80))

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "tf_bias": "15Min", "tf_entry": "1Min", "qty": 1},
    )

    assert out == {"intents": [], "events": []}
    # It tried both bias and entry
    assert [c[0] for c in api.calls].count("/api/market/bars") == 2


def test_compute_emits_debug_events_when_debug_on_and_skipping(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()
    monkeypatch.setattr(bot_mod, "_STRAT_DEBUG", True, raising=False)

    # Missing entry bars triggers debug breadcrumb "skip_missing_bars"
    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(80))

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "tf_bias": "15Min", "tf_entry": "1Min", "qty": 1},
    )

    assert out["intents"] == []
    assert out["events"] != []

    # Expect at least one strategy_debug event with the skip code
    codes = [e.get("payload", {}).get("code") for e in out["events"] if e.get("event_type") == "strategy_debug"]
    assert "skip_missing_bars" in codes


def test_compute_skips_when_bias_cannot_be_computed(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()

    # Bias needs enough EMA points: if we give too few closes, bias becomes "none"
    _seed_bars(api, sym="AAPL", tf="15Min", closes=[100.0] * 10)
    _seed_bars(api, sym="AAPL", tf="1Min", closes=_closes_up(80, step=0.02))

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "tf_bias": "15Min", "tf_entry": "1Min", "qty": 1},
    )

    assert out == {"intents": [], "events": []}


def test_compute_respects_min_confidence_gate(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()

    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(120))
    _seed_bars(api, sym="AAPL", tf="1Min", closes=_closes_up(120, step=0.02))

    # Force a valid triple but low confidence
    def fake_compute_signal(bars_entry, cfg, bias):
        return (100.0, 99.5, 101.0), ["X_REASON"], 0.10

    monkeypatch.setattr(bot_mod, "compute_signal", fake_compute_signal, raising=False)

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "min_confidence": 0.62, "qty": 1},
    )

    assert out == {"intents": [], "events": []}


def test_compute_limits_max_intents_per_run_and_keeps_symbol_order(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()

    syms = ["AAA", "BBB", "CCC"]
    for s in syms:
        _seed_bars(api, sym=s, tf="15Min", closes=_closes_up(120))
        _seed_bars(api, sym=s, tf="1Min", closes=_closes_up(120, step=0.02))

    # Always returns a valid triple and confidence above min
    def fake_compute_signal(bars_entry, cfg, bias):
        return (100.0, 99.0, 102.0), ["SIG_OK"], 0.99

    monkeypatch.setattr(bot_mod, "compute_signal", fake_compute_signal, raising=False)

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": syms, "max_intents_per_run": 2, "min_confidence": 0.0, "qty": 1},
    )

    assert len(out["intents"]) == 2
    assert [i["symbol"] for i in out["intents"]] == ["AAA", "BBB"]  # no sorting in bot.py
    assert len([e for e in out["events"] if e.get("event_type") == "signal"]) == 2


def test_compute_intent_contains_bias_and_signal_reasons(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()

    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(120))          # bias should be "up"
    _seed_bars(api, sym="AAPL", tf="1Min", closes=_closes_up(120, step=0.02))

    def fake_compute_signal(bars_entry, cfg, bias):
        # bias should be "up" here
        assert bias in ("up", "down")
        return (100.0, 99.5, 101.0), ["SIG_REASON"], 0.99

    monkeypatch.setattr(bot_mod, "compute_signal", fake_compute_signal, raising=False)

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "min_confidence": 0.0, "qty": 1},
    )

    assert len(out["intents"]) == 1
    intent = out["intents"][0]
    assert intent["symbol"] == "AAPL"
    assert intent["side"] in ("buy", "sell")
    assert "reasons" in intent
    assert "SIG_REASON" in intent["reasons"]  # signal reason included
    # bias reason code should be included too (from reason_codes)
    assert any(r in (bot_mod.R.BIAS_UP, bot_mod.R.BIAS_DN) for r in intent["reasons"])

    # signal event should exist and include matching fields
    sig_events = [e for e in out["events"] if e.get("event_type") == "signal"]
    assert len(sig_events) == 1
    payload = sig_events[0]["payload"]
    assert payload["strategy"] == "ema_trend" or payload["strategy"] == intent["strategy"]
    assert payload["reasons"] == intent["reasons"]
    assert payload["tf_bias"] == intent.get("tf_bias", payload["tf_bias"])  # tolerant


def test_generate_output_wraps_compute():
    api = FakeAPI()
    out = bot_mod.generate_output(api=api, config={"symbols": []})
    assert out == {"intents": [], "events": []}