# api/routes/tests/test_calendar.py
import importlib
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def mod():
    if "api.routes.calendar" in sys.modules:
        return importlib.reload(sys.modules["api.routes.calendar"])
    return importlib.import_module("api.routes.calendar")


def _make_client(mod):
    app = FastAPI()
    app.include_router(mod.router)
    return TestClient(app)


def test_no_trade_windows_reads_local_json(mod, tmp_path, monkeypatch):
    # Create a temp no_trade_events.json
    p = tmp_path / "no_trade_events.json"
    p.write_text(
        """
        {
          "timezone": "America/New_York",
          "events": [
            {"name": "CPI", "date": "2026-01-15", "time": "08:30", "buffer_min": 30},
            {"name": "FOMC", "date": "2026-01-29", "time": "14:00", "buffer_min": 60}
          ]
        }
        """.strip(),
        encoding="utf-8",
    )

    # Point module constant path to our temp file
    monkeypatch.setattr(mod, "_NO_TRADE_JSON_PATH", Path(p))

    client = _make_client(mod)
    res = client.get("/api/calendar/no-trade-windows")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["source"] == "local_json"
    assert len(body["windows"]) == 2
    assert body["windows"][0]["name"] == "CPI"
    assert "2026-01-15T08:30:00" in body["windows"][0]["event"]


def test_no_trade_windows_500_when_file_missing(mod, monkeypatch):
    monkeypatch.setattr(mod, "_NO_TRADE_JSON_PATH", Path("does_not_exist.json"))

    client = _make_client(mod)
    res = client.get("/api/calendar/no-trade-windows")

    assert res.status_code == 500
    assert "calendar_failed" in res.json()["detail"]


def test_no_trade_windows_fmp_happy_path(mod, monkeypatch):
    # monkeypatch FMP calendar function
    monkeypatch.setattr(
        mod,
        "fmp_economic_calendar",
        lambda f, t: {
            "data": [
                {"date": "2026-01-15 08:30:00", "event": "CPI"},
                {"date": "2026-01-29T14:00:00", "name": "FOMC"},
            ]
        },
    )

    client = _make_client(mod)
    res = client.get("/api/calendar/no-trade-windows/fmp?from_date=2026-01-01&to_date=2026-01-31&buffer_min=30")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["source"] == "fmp"
    assert len(body["windows"]) == 2
    assert body["windows"][0]["name"] == "CPI"
    assert body["windows"][0]["meta"]["source"] == "fmp"


def test_no_trade_windows_fmp_skips_events_without_date(mod, monkeypatch):
    monkeypatch.setattr(
        mod,
        "fmp_economic_calendar",
        lambda f, t: {"data": [{"event": "No date event"}]},
    )

    client = _make_client(mod)
    res = client.get("/api/calendar/no-trade-windows/fmp?from_date=2026-01-01&to_date=2026-01-31")

    assert res.status_code == 200
    body = res.json()
    assert body["windows"] == []


def test_no_trade_windows_fmp_returns_502_on_exception(mod, monkeypatch):
    def _boom(f, t):
        raise Exception("FMP down")

    monkeypatch.setattr(mod, "fmp_economic_calendar", _boom)

    client = _make_client(mod)
    res = client.get("/api/calendar/no-trade-windows/fmp?from_date=2026-01-01&to_date=2026-01-31")

    assert res.status_code == 502
    assert "calendar_fmp_failed" in res.json()["detail"]
