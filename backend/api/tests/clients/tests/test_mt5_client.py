# backend/api/clients/tests/test_fx_mt5_client.py
from __future__ import annotations

from types import SimpleNamespace
import pytest

from api.clients import fx_mt5_client


class DummyMT5:
    def __init__(self):
        self._init_ok = True
        self._login_ok = True
        self._last_error = (1, "err")
        self._rates = [{"time": 1, "open": 1, "high": 2, "low": 0.5, "close": 1.5, "tick_volume": 10}]
        self._tick = SimpleNamespace(bid=1.0, ask=1.1, time_msc=123)

        self.initialize_calls = 0
        self.login_calls = 0
        self.copy_calls = 0
        self.tick_calls = 0

    def initialize(self):
        self.initialize_calls += 1
        return self._init_ok

    def login(self, login, password=None, server=None):
        self.login_calls += 1
        return self._login_ok

    def last_error(self):
        return self._last_error

    def copy_rates_from_pos(self, symbol, timeframe, start_pos, count):
        self.copy_calls += 1
        return self._rates

    def symbol_info_tick(self, symbol):
        self.tick_calls += 1
        return self._tick


def test_require_mt5_raises_if_missing(monkeypatch):
    monkeypatch.setattr(fx_mt5_client, "mt5", None)
    with pytest.raises(RuntimeError) as e:
        fx_mt5_client.ensure_mt5()
    assert "MetaTrader5 package not installed" in str(e.value)


def test_ensure_mt5_success(monkeypatch):
    m = DummyMT5()
    monkeypatch.setattr(fx_mt5_client, "mt5", m)

    assert fx_mt5_client.ensure_mt5() is True
    assert m.initialize_calls == 1


def test_ensure_mt5_failure(monkeypatch):
    m = DummyMT5()
    m._init_ok = False
    m._last_error = (500, "no terminal")
    monkeypatch.setattr(fx_mt5_client, "mt5", m)

    with pytest.raises(RuntimeError) as e:
        fx_mt5_client.ensure_mt5()
    assert "MT5 initialize failed" in str(e.value)
    assert m.initialize_calls == 1


def test_login_skipped_when_creds_missing(monkeypatch):
    m = DummyMT5()
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    fx_mt5_client.mt5_login()
    assert m.initialize_calls == 1
    assert m.login_calls == 0


def test_login_called_when_creds_present(monkeypatch):
    m = DummyMT5()
    monkeypatch.setattr(fx_mt5_client, "mt5", m)

    def _getenv(name, default=""):
        if name == "MT5_LOGIN":
            return "123"
        if name == "MT5_PASSWORD":
            return "pw"
        if name == "MT5_SERVER":
            return "Broker-Server"
        return default

    monkeypatch.setattr(fx_mt5_client.os, "getenv", _getenv)

    fx_mt5_client.mt5_login()
    assert m.initialize_calls == 1
    assert m.login_calls == 1


def test_login_raises_on_bad_login(monkeypatch):
    m = DummyMT5()
    m._login_ok = False
    m._last_error = (401, "bad creds")
    monkeypatch.setattr(fx_mt5_client, "mt5", m)

    def _getenv(name, default=""):
        if name == "MT5_LOGIN":
            return "123"
        if name == "MT5_PASSWORD":
            return "pw"
        if name == "MT5_SERVER":
            return "Broker-Server"
        return default

    monkeypatch.setattr(fx_mt5_client.os, "getenv", _getenv)

    with pytest.raises(RuntimeError) as e:
        fx_mt5_client.mt5_login()
    assert "MT5 login failed" in str(e.value)
    assert m.login_calls == 1


def test_login_raises_if_login_not_int(monkeypatch):
    m = DummyMT5()
    monkeypatch.setattr(fx_mt5_client, "mt5", m)

    def _getenv(name, default=""):
        if name == "MT5_LOGIN":
            return "abc"
        if name == "MT5_PASSWORD":
            return "pw"
        if name == "MT5_SERVER":
            return "Broker-Server"
        return default

    monkeypatch.setattr(fx_mt5_client.os, "getenv", _getenv)

    with pytest.raises(RuntimeError) as e:
        fx_mt5_client.mt5_login()
    assert "MT5_LOGIN must be an integer" in str(e.value)


@pytest.mark.parametrize("bad_symbol", ["", "   ", None])
def test_get_fx_bars_requires_symbol(monkeypatch, bad_symbol):
    m = DummyMT5()
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    with pytest.raises(ValueError):
        fx_mt5_client.get_fx_bars(bad_symbol, timeframe=1, count=10)


def test_get_fx_bars_requires_positive_count(monkeypatch):
    m = DummyMT5()
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    with pytest.raises(ValueError):
        fx_mt5_client.get_fx_bars("EURUSD", timeframe=1, count=0)


def test_get_fx_bars_happy_path(monkeypatch):
    m = DummyMT5()
    m._rates = [{"time": 10, "open": 1.0, "high": 1.2, "low": 0.9, "close": 1.1, "tick_volume": 42}]
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    out = fx_mt5_client.get_fx_bars("EURUSD", timeframe=1, count=1)
    assert len(out) == 1
    assert out[0]["t"] == 10
    assert out[0]["open"] == 1.0
    assert out[0]["volume"] == 42.0
    assert m.copy_calls == 1


def test_get_fx_bars_raises_when_copy_none(monkeypatch):
    m = DummyMT5()
    m._rates = None
    m._last_error = (999, "no data")
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    with pytest.raises(RuntimeError) as e:
        fx_mt5_client.get_fx_bars("EURUSD", timeframe=1, count=10)
    assert "copy_rates failed" in str(e.value)


@pytest.mark.parametrize("bad_symbol", ["", "   ", None])
def test_get_fx_quote_requires_symbol(monkeypatch, bad_symbol):
    m = DummyMT5()
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    with pytest.raises(ValueError):
        fx_mt5_client.get_fx_quote(bad_symbol)


def test_get_fx_quote_happy_path(monkeypatch):
    m = DummyMT5()
    m._tick = SimpleNamespace(bid=1.0, ask=1.25, time_msc=555)
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    out = fx_mt5_client.get_fx_quote("EURUSD")
    assert out["symbol"] == "EURUSD"
    assert out["bid"] == 1.0
    assert out["ask"] == 1.25
    assert out["spread"] == 0.25
    assert out["time_msc"] == 555
    assert m.tick_calls == 1


def test_get_fx_quote_raises_when_tick_none(monkeypatch):
    m = DummyMT5()
    m._tick = None
    m._last_error = (404, "unknown symbol")
    monkeypatch.setattr(fx_mt5_client, "mt5", m)
    monkeypatch.setattr(fx_mt5_client.os, "getenv", lambda *args, **kwargs: "")

    with pytest.raises(RuntimeError) as e:
        fx_mt5_client.get_fx_quote("EURUSD")
    assert "symbol_info_tick failed" in str(e.value)
