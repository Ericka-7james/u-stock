# backend/api/routes/tests/test_fundamentals.py
from __future__ import annotations

import importlib
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def mod():
    if "api.routes.fundamentals" in sys.modules:
        return importlib.reload(sys.modules["api.routes.fundamentals"])
    return importlib.import_module("api.routes.fundamentals")


def _client(mod):
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_overview_success(mod, monkeypatch):
    # Your current fundamentals route expects Alpha keys like "Name"
    monkeypatch.setattr(
        mod,
        "alpha_company_overview",
        lambda symbol: {"Name": "Apple Inc.", "MarketCapitalization": "123"},
    )

    client = _client(mod)
    res = client.get("/api/fundamentals/overview?symbol=aapl")

    assert res.status_code == 200
    body = res.json()

    assert body["ok"] is True
    assert body["symbol"] == "AAPL"

    # ✅ New contract: normalized fields
    assert body["company"]["name"] == "Apple Inc."
    assert body["valuation"]["market_cap"] == 123


def test_overview_requires_symbol(mod):
    client = _client(mod)
    res = client.get("/api/fundamentals/overview?symbol=")
    assert res.status_code in (400, 422)  # depends on FastAPI validation vs your clean_symbol
