# u-stock-bots/runner/tests/test_strategy_loader.py
from __future__ import annotations

import types
import pytest

# Import the module under test
from runner import strategy_loader as sl


class DummyAPI:
    """Minimal stand-in for UStockAPI."""
    pass


def _fake_module(**attrs):
    """Create a lightweight module-like object with arbitrary attributes."""
    return types.SimpleNamespace(**attrs)


# -------------------------
# _safe_bot_id
# -------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("ema_trend", "ema_trend"),
        (" EMA_TREND ", "ema_trend"),
        ("orb", "orb"),
        ("ORB", "orb"),
        ("", ""),
        (None, ""),
        ("bad-id", ""),          # dash not allowed
        ("bad.id", ""),          # dot not allowed
        ("bad id", ""),          # space not allowed
        ("../escape", ""),       # path-ish
        ("UPPER_OK", "upper_ok"),# underscores allowed, lowercased
    ],
)
def test_safe_bot_id(raw, expected):
    assert sl._safe_bot_id(raw) == expected


# -------------------------
# load_bot_module
# -------------------------

def test_load_bot_module_invalid_bot_id_raises():
    with pytest.raises(ValueError):
        sl.load_bot_module("bad-id")


def test_load_bot_module_imports_expected_name(monkeypatch):
    called = {}

    def fake_import(name: str):
        called["name"] = name
        return _fake_module()

    monkeypatch.setattr(sl.importlib, "import_module", fake_import)

    mod = sl.load_bot_module("ema_trend")
    assert mod is not None
    assert called["name"] == "bots.ema_trend.bot"


# -------------------------
# _call_strategy_fn signature flexibility
# -------------------------

def test_call_strategy_fn_prefers_api_config_keywords():
    api = DummyAPI()
    cfg = {"x": 1}

    def fn(*, api, config):
        return {"ok": True, "api": api, "cfg": config}

    out = sl._call_strategy_fn(fn, api=api, cfg=cfg)
    assert out["ok"] is True
    assert out["api"] is api
    assert out["cfg"] == cfg


def test_call_strategy_fn_falls_back_to_api_cfg_keywords():
    api = DummyAPI()
    cfg = {"x": 2}

    def fn(*, api, cfg):
        return {"ok": True, "api": api, "cfg": cfg}

    out = sl._call_strategy_fn(fn, api=api, cfg=cfg)
    assert out["ok"] is True
    assert out["api"] is api
    assert out["cfg"] == cfg


def test_call_strategy_fn_falls_back_to_positional():
    api = DummyAPI()
    cfg = {"x": 3}

    def fn(a, b):
        return {"ok": True, "api": a, "cfg": b}

    out = sl._call_strategy_fn(fn, api=api, cfg=cfg)
    assert out["ok"] is True
    assert out["api"] is api
    assert out["cfg"] == cfg


# -------------------------
# compute_bot_output: invalid bot_id (fail-soft)
# -------------------------

def test_compute_bot_output_invalid_bot_id_returns_event(monkeypatch):
    api = DummyAPI()

    # make timestamps deterministic
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    out = sl.compute_bot_output(api, "bad-id", {})
    assert out["intents"] == []
    assert isinstance(out["events"], list)
    assert out["events"][0]["event_type"] == "runner_bot_load_failed"
    assert out["events"][0]["payload"]["error"] == "invalid bot_id"


# -------------------------
# compute_bot_output: load failure (import error)
# -------------------------

def test_compute_bot_output_load_failure_returns_event(monkeypatch):
    api = DummyAPI()
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    def boom(_bid: str):
        raise RuntimeError("nope")

    monkeypatch.setattr(sl, "load_bot_module", boom)

    out = sl.compute_bot_output(api, "ema_trend", {})
    assert out["intents"] == []
    assert out["events"][0]["event_type"] == "runner_bot_load_failed"
    assert out["events"][0]["payload"]["bot_id"] == "ema_trend"
    assert "RuntimeError" in out["events"][0]["payload"]["error"]


# -------------------------
# compute_bot_output: generate_output path
# -------------------------

def test_compute_bot_output_generate_output_happy_path(monkeypatch):
    api = DummyAPI()

    # Make coerce_intents_list deterministic and easy to validate
    monkeypatch.setattr(sl, "coerce_intents_list", lambda x: list(x or []))
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    bot_mod = _fake_module(
        generate_output=lambda **kwargs: {
            "intents": [{"symbol": "AAPL", "side": "buy"}],
            "events": [{"event_type": "bot_note"}],
        }
    )
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "ema_trend", {"k": "v"})
    assert out["intents"] == [{"symbol": "AAPL", "side": "buy"}]
    assert out["events"] == [{"event_type": "bot_note"}]
    assert out["meta"]["bot_id"] == "ema_trend"
    assert out["meta"]["entrypoint"] == "generate_output"


def test_compute_bot_output_generate_output_non_dict(monkeypatch):
    api = DummyAPI()
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    bot_mod = _fake_module(generate_output=lambda **kwargs: ["not", "a", "dict"])
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "ema_trend", {})
    assert out["intents"] == []
    assert out["events"][0]["event_type"] == "runner_bot_generate_output_failed"
    assert "non-dict" in out["events"][0]["payload"]["error"]


def test_compute_bot_output_generate_output_throws(monkeypatch):
    api = DummyAPI()
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    def boom(**kwargs):
        raise ValueError("bad math")

    bot_mod = _fake_module(generate_output=boom)
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "ema_trend", {})
    assert out["intents"] == []
    assert out["events"][0]["event_type"] == "runner_bot_generate_output_failed"
    assert "ValueError" in out["events"][0]["payload"]["error"]


# -------------------------
# compute_bot_output: generate_intents path
# -------------------------

def test_compute_bot_output_generate_intents_happy_path(monkeypatch):
    api = DummyAPI()

    # pretend coercion filters/normalizes; we just pass-through to validate call path
    monkeypatch.setattr(sl, "coerce_intents_list", lambda x: list(x or []))

    bot_mod = _fake_module(generate_intents=lambda **kwargs: [{"symbol": "MSFT", "side": "sell"}])
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "orb", {})
    assert out["intents"] == [{"symbol": "MSFT", "side": "sell"}]
    assert out["events"] == []
    assert out["meta"]["bot_id"] == "orb"
    assert out["meta"]["entrypoint"] == "generate_intents"


def test_compute_bot_output_generate_intents_throws(monkeypatch):
    api = DummyAPI()
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    def boom(**kwargs):
        raise RuntimeError("downstream")

    bot_mod = _fake_module(generate_intents=boom)
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "orb", {})
    assert out["intents"] == []
    assert out["events"][0]["event_type"] == "runner_bot_generate_intents_failed"
    assert "RuntimeError" in out["events"][0]["payload"]["error"]


# -------------------------
# compute_bot_output: run path
# -------------------------

def test_compute_bot_output_run_happy_path(monkeypatch):
    api = DummyAPI()
    monkeypatch.setattr(sl, "coerce_intents_list", lambda x: list(x or []))

    bot_mod = _fake_module(run=lambda **kwargs: [{"symbol": "TSLA", "side": "buy"}])
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "ema_trend", {})
    assert out["intents"] == [{"symbol": "TSLA", "side": "buy"}]
    assert out["events"] == []
    assert out["meta"]["entrypoint"] == "run"


def test_compute_bot_output_run_throws(monkeypatch):
    api = DummyAPI()
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    def boom(**kwargs):
        raise Exception("kaboom")

    bot_mod = _fake_module(run=boom)
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "ema_trend", {})
    assert out["intents"] == []
    assert out["events"][0]["event_type"] == "runner_bot_run_failed"
    assert "kaboom" in out["events"][0]["payload"]["error"]


# -------------------------
# compute_bot_output: no entrypoint
# -------------------------

def test_compute_bot_output_no_entrypoint(monkeypatch):
    api = DummyAPI()
    monkeypatch.setattr(sl, "now_iso", lambda: "2026-02-24T00:00:00Z")

    bot_mod = _fake_module()  # no functions
    monkeypatch.setattr(sl, "load_bot_module", lambda _bid: bot_mod)

    out = sl.compute_bot_output(api, "ema_trend", {})
    assert out["intents"] == []
    assert out["events"][0]["event_type"] == "runner_bot_no_entrypoint"
    assert out["events"][0]["payload"]["bot_id"] == "ema_trend"
    assert out["events"][0]["payload"]["expected"] == ["generate_output", "generate_intents", "run"]


# -------------------------
# _as_list_of_dicts
# -------------------------

def test_as_list_of_dicts_filters_correctly():
    assert sl._as_list_of_dicts(None) == []
    assert sl._as_list_of_dicts("nope") == []
    assert sl._as_list_of_dicts([{"a": 1}, "x", 3, {"b": 2}]) == [{"a": 1}, {"b": 2}]