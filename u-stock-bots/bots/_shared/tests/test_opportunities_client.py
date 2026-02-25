# u-stock-bots/bots/_shared/tests/test_opportunities_client.py
from __future__ import annotations

import pytest

from bots._shared import opportunities_client as oc


class DummyAPI:
    def __init__(self, payload=None, exc: Exception | None = None):
        self.payload = payload
        self.exc = exc
        self.calls = []

    def get(self, path: str, params=None):
        self.calls.append((path, params))
        if self.exc is not None:
            raise self.exc
        return self.payload


# -------------------------
# helpers: _clamp_int, _clean_symbol, _extract_symbols
# -------------------------

@pytest.mark.parametrize(
    "v,lo,hi,default,expected",
    [
        (12, 1, 50, 12, 12),
        ("7", 1, 50, 12, 7),
        ("nope", 1, 50, 12, 12),
        (0, 1, 50, 12, 1),
        (-99, 1, 50, 12, 1),
        (999, 1, 50, 12, 50),
    ],
)
def test_clamp_int(v, lo, hi, default, expected):
    assert oc._clamp_int(v, lo, hi, default) == expected


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("aapl", "AAPL"),
        (" AAPL ", "AAPL"),
        ("brk.b", "BRK.B"),
        ("RIVN-WS", "RIVN-WS"),
        ("", ""),
        (None, ""),
        (" " * 5, ""),
        ("TOO_LONG_SYMBOL_NAME_123", ""),  # >16 chars
        ("BAD$SYM", ""),
        ("BAD/SYM", ""),
        ("BAD_SYM", ""),  # underscore not allowed
    ],
)
def test_clean_symbol(raw, expected):
    assert oc._clean_symbol(raw) == expected


def test_extract_symbols_strict_shape():
    assert oc._extract_symbols(None) == []
    assert oc._extract_symbols("nope") == []
    assert oc._extract_symbols({"symbols": "AAPL"}) == []
    assert oc._extract_symbols({"symbols": None}) == []


def test_extract_symbols_sanitizes_and_dedupes_stable_order():
    payload = {
        "symbols": [
            " aapl ",
            "AAPL",          # dup
            "msft",
            "BAD$SYM",       # filtered
            "brk.b",
            "MSFT",          # dup
            None,            # filtered
            "rivn-ws",
        ]
    }
    assert oc._extract_symbols(payload) == ["AAPL", "MSFT", "BRK.B", "RIVN-WS"]


# -------------------------
# get_opportunity_symbols: request params normalization
# -------------------------

def test_get_opportunity_symbols_builds_params_and_calls_api(monkeypatch):
    # Freeze time so latency/ts are deterministic
    monkeypatch.setattr(oc.time, "time", lambda: 1000.0)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 1234567890)

    api = DummyAPI(payload={"ok": True, "symbols": ["AAPL"], "generatedAt": 111, "meta": {"src": "x"}})

    out = oc.get_opportunity_symbols(
        api,
        bot_id="  EMA_TREND  ",
        limit="7",
        include_leaders=True,
        leaders_direction="DOWN",     # should normalize to "down"
        leaders_show_more=True,
        cache_bust=True,
    )

    assert len(api.calls) == 1
    path, params = api.calls[0]
    assert path == "/api/opportunities"
    assert params == {
        "bot_id": "EMA_TREND",
        "limit": 7,
        "include_leaders": 1,
        "leaders_direction": "down",
        "leaders_show_more": 1,
        "cache_bust": 1,
    }

    assert out.ok is True
    assert out.symbols == ["AAPL"]
    assert out.generated_at == 111
    assert out.error == ""
    assert out.meta["client"] == "opportunities_client"
    assert out.meta["params"] == params
    assert out.meta["server_meta"] == {"src": "x"}
    assert out.meta["returned"] == 1
    assert out.meta["ts"] == 1234567890
    assert out.meta["latency_ms"] == 0


def test_get_opportunity_symbols_default_bot_id_unknown_and_limit_clamped(monkeypatch):
    monkeypatch.setattr(oc.time, "time", lambda: 1000.0)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 1)

    api = DummyAPI(payload={"ok": True, "symbols": ["AAPL"], "generatedAt": 0, "meta": {}})

    out = oc.get_opportunity_symbols(api, bot_id=" ", limit=999, include_leaders=False, leaders_direction="weird")

    _, params = api.calls[0]
    assert params["bot_id"] == "unknown"
    assert params["limit"] == 50  # clamped
    assert params["include_leaders"] == 0
    assert params["leaders_direction"] == "up"  # default when not "down"
    assert out.ok is True


# -------------------------
# get_opportunity_symbols: fail-soft behaviors
# -------------------------

def test_get_opportunity_symbols_api_exception_returns_ok_false(monkeypatch):
    # time moves a bit to ensure latency calc works
    t = {"x": 1000.0}

    def fake_time():
        # each call advances 0.05s
        t["x"] += 0.05
        return t["x"]

    monkeypatch.setattr(oc.time, "time", fake_time)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 42)

    api = DummyAPI(exc=RuntimeError("network down"))

    out = oc.get_opportunity_symbols(api, bot_id="ema_trend")

    assert out.ok is False
    assert out.symbols == []
    assert out.generated_at == 0
    assert "/api/opportunities failed" in out.error
    assert "RuntimeError" in out.error
    assert out.meta["client"] == "opportunities_client"
    assert out.meta["params"]["bot_id"] == "ema_trend"
    assert out.meta["latency_ms"] >= 0
    assert out.meta["ts"] == 42


def test_get_opportunity_symbols_bad_payload_type_returns_ok_false(monkeypatch):
    monkeypatch.setattr(oc.time, "time", lambda: 1000.0)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 99)

    api = DummyAPI(payload=["not", "a", "dict"])

    out = oc.get_opportunity_symbols(api, bot_id="ema_trend")

    assert out.ok is False
    assert out.symbols == []
    assert out.generated_at == 0
    assert out.error == "Bad response type from /api/opportunities (expected object)"
    assert out.meta["client"] == "opportunities_client"
    assert out.meta["returned"] == 0


def test_get_opportunity_symbols_extracts_symbols_and_sets_warning_when_ok_true_but_empty(monkeypatch):
    monkeypatch.setattr(oc.time, "time", lambda: 1000.0)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 7)

    # ok=true but symbols are missing/invalid -> warning
    api = DummyAPI(payload={"ok": True, "symbols": "AAPL", "generatedAt": 5, "meta": {"a": 1}})

    out = oc.get_opportunity_symbols(api, bot_id="ema_trend")

    assert out.ok is True
    assert out.symbols == []
    assert out.generated_at == 5
    assert out.meta["warning"] == "ok_true_but_empty_symbols"
    assert out.meta["server_meta"] == {"a": 1}


def test_get_opportunity_symbols_generatedAt_non_int_falls_back_to_zero(monkeypatch):
    monkeypatch.setattr(oc.time, "time", lambda: 1000.0)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 7)

    api = DummyAPI(payload={"ok": True, "symbols": ["AAPL"], "generatedAt": "nope", "meta": {}})

    out = oc.get_opportunity_symbols(api, bot_id="ema_trend")

    assert out.generated_at == 0


def test_get_opportunity_symbols_server_meta_non_dict_becomes_empty_dict(monkeypatch):
    monkeypatch.setattr(oc.time, "time", lambda: 1000.0)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 7)

    api = DummyAPI(payload={"ok": True, "symbols": ["AAPL"], "generatedAt": 1, "meta": ["nope"]})

    out = oc.get_opportunity_symbols(api, bot_id="ema_trend")

    assert out.meta["server_meta"] == {}


def test_get_opportunity_symbols_passes_through_server_error_string(monkeypatch):
    monkeypatch.setattr(oc.time, "time", lambda: 1000.0)
    monkeypatch.setattr(oc, "_now_epoch", lambda: 7)

    api = DummyAPI(payload={"ok": False, "symbols": ["AAPL"], "generatedAt": 1, "meta": {}, "error": "rate_limited"})

    out = oc.get_opportunity_symbols(api, bot_id="ema_trend")

    assert out.ok is False
    assert out.error == "rate_limited"