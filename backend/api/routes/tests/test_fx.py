# backend/api/routes/tests/test_fx.py
from __future__ import annotations

import builtins
import types

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.routes.fx as mod


@pytest.fixture()
def client():
    app = FastAPI()
    app.include_router(mod.router)

    # ✅ runner-only endpoint: override dependency so tests don't need real JWTs
    app.dependency_overrides[mod.require_bot_runner] = lambda: "test-user"

    return TestClient(app)


def test_fx_quote_returns_501_when_mt5_missing(client, monkeypatch):
    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "MetaTrader5":
            raise ModuleNotFoundError("No module named 'MetaTrader5'")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    resp = client.get("/api/market/fx/quote", params={"symbol": "EURUSD"})
    assert resp.status_code == 501
    assert resp.json()["detail"].startswith("MT5 is not available on this server")


def test_fx_quote_returns_500_when_mt5_initialize_fails(client, monkeypatch):
    mt5 = types.SimpleNamespace()
    mt5.initialize = lambda: False
    mt5.last_error = lambda: (1, "init failed")
    mt5.symbol_info_tick = lambda sym: None
    mt5.shutdown = lambda: None

    # Optional functions referenced by your code
    mt5.symbol_info = lambda sym: None
    mt5.symbol_select = lambda sym, v: True

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "MetaTrader5":
            return mt5
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    resp = client.get("/api/market/fx/quote", params={"symbol": "EURUSD"})
    assert resp.status_code == 500
    assert "MT5 initialize failed" in resp.json()["detail"]


def test_fx_quote_returns_400_when_symbol_not_available(client, monkeypatch):
    mt5 = types.SimpleNamespace()
    mt5.initialize = lambda: True
    mt5.last_error = lambda: (0, "ok")
    mt5.shutdown = lambda: None

    seen = {"sym": None}

    def symbol_info_tick(sym):
        seen["sym"] = sym
        return None

    mt5.symbol_info_tick = symbol_info_tick

    # Optional functions referenced by your code
    mt5.symbol_info = lambda sym: types.SimpleNamespace(visible=True)
    mt5.symbol_select = lambda sym, v: True

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "MetaTrader5":
            return mt5
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    resp = client.get("/api/market/fx/quote", params={"symbol": "  EURUSD  "})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Symbol not available in MT5: EURUSD"
    assert seen["sym"] == "EURUSD"  # trimmed


def test_fx_quote_success_returns_quote_payload(client, monkeypatch):
    class Tick:
        bid = 1.2345
        ask = 1.2349
        time_msc = 1700000000123

    mt5 = types.SimpleNamespace()
    mt5.initialize = lambda: True
    mt5.last_error = lambda: (0, "ok")
    mt5.symbol_info_tick = lambda sym: Tick()
    mt5.shutdown = lambda: None

    # Optional functions referenced by your code
    mt5.symbol_info = lambda sym: types.SimpleNamespace(visible=True)
    mt5.symbol_select = lambda sym, v: True

    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "MetaTrader5":
            return mt5
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    resp = client.get("/api/market/fx/quote", params={"symbol": " EURUSD "})
    assert resp.status_code == 200

    data = resp.json()
    assert data["ok"] is True
    assert data["symbol"] == "EURUSD"
    assert data["bid"] == pytest.approx(1.2345)
    assert data["ask"] == pytest.approx(1.2349)
    assert data["spread"] == pytest.approx(1.2349 - 1.2345)
    assert data["time_msc"] == 1700000000123
    assert data["source"] == "mt5"
