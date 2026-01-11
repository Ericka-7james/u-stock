# api/routes/tests/test_fundamentals.py
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
    monkeypatch.setattr(
        mod,
        "alpha_company_overview",
        lambda symbol: {"name": "Apple Inc.", "marketCap": "123"},
    )

    client = _client(mod)
    res = client.get("/api/fundamentals/overview?symbol=aapl")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["symbol"] == "AAPL"
    assert body["name"] == "Apple Inc."
    assert body["marketCap"] == "123"


def test_overview_missing_symbol_returns_400(mod, monkeypatch):
    # In case your module still raises ValueError instead of HTTPException,
    # you'll get 502. This test assumes you applied the recommended update.
    client = _client(mod)
    res = client.get("/api/fundamentals/overview?symbol=")

    assert res.status_code == 400
    assert "symbol" in str(res.json()["detail"]).lower()


def test_overview_upstream_failure_returns_502(mod, monkeypatch):
    def _boom(symbol: str):
        raise Exception("alpha down")

    monkeypatch.setattr(mod, "alpha_company_overview", _boom)

    client = _client(mod)
    res = client.get("/api/fundamentals/overview?symbol=AAPL")

    assert res.status_code == 502
    assert "fundamentals_failed" in res.json()["detail"]
