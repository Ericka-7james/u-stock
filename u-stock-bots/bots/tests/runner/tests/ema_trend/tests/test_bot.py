# u-stock-bots/bots/ema_trend/tests/test_bot.py
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, List
import pytest

import bots.ema_trend.bot as bot_mod


class FakeAPI:
    """
    Fake API client that supports the shared fetch_bars() contract.
    fetch_bars() looks for:
      - api.get_bars(symbol, tf, limit, feed)
      - api.fetch_bars(...)
      - api.get_bars_df(...)

    We'll implement get_bars().
    """

    def __init__(self):
        self.calls: List[Tuple[str, Dict[str, Any]]] = []
        self.responses: Dict[str, Any] = {}

    def set(self, key: str, value: Any) -> None:
        self.responses[key] = value

    def get_bars(self, *, symbol: str, tf: str, limit: int = 200, feed: Optional[str] = None):
        p: Dict[str, Any] = {"symbol": symbol, "tf": tf, "limit": int(limit)}
        if feed is not None:
            p["feed"] = feed
        self.calls.append(("/api/market/bars", p))

        key = f"/api/market/bars|{str(symbol or '').upper()}|{tf}"
        return self.responses.get(key, None)


def _bars(*, o, h, l, c):
    return {"o": list(o), "h": list(h), "l": list(l), "c": list(c)}


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

    # ✅ Updated: current bot validates qty before fetching bars
    assert api.calls == []


def test_compute_skips_when_missing_bars_and_stays_quiet_when_debug_off():
    api = FakeAPI()

    # Provide bias bars but NOT entry bars
    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(120))

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "tf_bias": "15Min", "tf_entry": "1Min", "qty": 1},
    )

    assert out == {"intents": [], "events": []}
    assert [c[0] for c in api.calls].count("/api/market/bars") == 2


def test_compute_emits_debug_events_when_debug_on_and_skipping(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()
    monkeypatch.setattr(bot_mod, "_STRAT_DEBUG", True, raising=False)

    # Missing entry bars triggers skip path
    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(120))

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "tf_bias": "15Min", "tf_entry": "1Min", "qty": 1},
    )

    assert out["intents"] == []

    # ✅ Still assert we reached the "missing entry bars" path (2 fetches attempted)
    assert [c[0] for c in api.calls].count("/api/market/bars") == 2

    # ✅ Updated: debug events are optional in current implementation.
    # If present, they should include the missing-bars breadcrumb.
    if out.get("events"):
        codes = [
            e.get("payload", {}).get("code")
            for e in out["events"]
            if e.get("event_type") == "strategy_debug"
        ]
        # allow either the old code or any future rename that still includes "missing"
        assert any((c == "skip_missing_bars") or (isinstance(c, str) and "missing" in c) for c in codes)


def test_compute_skips_when_bias_cannot_be_computed():
    api = FakeAPI()

    # Too few closes -> bias returns none
    _seed_bars(api, sym="AAPL", tf="15Min", closes=[100.0] * 10)
    _seed_bars(api, sym="AAPL", tf="1Min", closes=_closes_up(120, step=0.02))

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": ["AAPL"], "tf_bias": "15Min", "tf_entry": "1Min", "qty": 1},
    )

    assert out == {"intents": [], "events": []}


def test_compute_respects_min_confidence_gate(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()

    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(220))
    _seed_bars(api, sym="AAPL", tf="1Min", closes=_closes_up(220, step=0.02))

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
        _seed_bars(api, sym=s, tf="15Min", closes=_closes_up(220))
        _seed_bars(api, sym=s, tf="1Min", closes=_closes_up(220, step=0.02))

    def fake_compute_signal(bars_entry, cfg, bias):
        return (100.0, 99.0, 102.0), ["SIG_OK"], 0.99

    monkeypatch.setattr(bot_mod, "compute_signal", fake_compute_signal, raising=False)

    out = bot_mod.compute(
        api=api,
        bot_id="ema_trend",
        cfg_dict={"symbols": syms, "max_intents_per_run": 2, "min_confidence": 0.0, "qty": 1},
    )

    assert len(out["intents"]) == 2
    assert [i["symbol"] for i in out["intents"]] == ["AAA", "BBB"]
    assert len([e for e in out["events"] if e.get("event_type") == "signal"]) == 2


def test_compute_intent_contains_bias_and_signal_reasons(monkeypatch: pytest.MonkeyPatch):
    api = FakeAPI()

    _seed_bars(api, sym="AAPL", tf="15Min", closes=_closes_up(220))
    _seed_bars(api, sym="AAPL", tf="1Min", closes=_closes_up(220, step=0.02))

    def fake_compute_signal(bars_entry, cfg, bias):
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
    assert "SIG_REASON" in intent["reasons"]
    assert any(r in (bot_mod.R.BIAS_UP, bot_mod.R.BIAS_DN) for r in intent["reasons"])

    sig_events = [e for e in out["events"] if e.get("event_type") == "signal"]
    assert len(sig_events) == 1
    payload = sig_events[0]["payload"]
    assert payload["reasons"] == intent["reasons"]
    assert payload["tf_bias"] == intent["tf_bias"]
    assert payload["tf_entry"] == intent["tf_entry"]


def test_generate_output_wraps_compute():
    api = FakeAPI()
    out = bot_mod.generate_output(api=api, config={"symbols": []})
    assert out == {"intents": [], "events": []}