# backend/api/routes/tests/test_calendar.py
from __future__ import annotations

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

    monkeypatch.setattr(mod, "_NO_TRADE_JSON_PATH", Path(p))

    client = _make_client(mod)
    res = client.get("/api/calendar/no-trade-windows")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["source"] == "local_json"
    assert body["tz"] == "America/New_York"
    assert len(body["windows"]) == 2
    assert body["windows"][0]["name"] == "CPI"
    assert "2026-01-15T08:30:00" in body["windows"][0]["event"]


def test_no_trade_windows_returns_empty_when_file_missing(mod, monkeypatch):
    # New contract: missing file => 200 with empty windows
    monkeypatch.setattr(mod, "_NO_TRADE_JSON_PATH", Path("does_not_exist.json"))

    client = _make_client(mod)
    res = client.get("/api/calendar/no-trade-windows")

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["source"] == "local_json"
    assert body["windows"] == []


def test_no_trade_windows_fmp_happy_path(mod, monkeypatch):
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
    res = client.get(
        "/api/calendar/no-trade-windows/fmp"
        "?from_date=2026-01-01&to_date=2026-01-31&buffer_min=30"
    )

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["source"] == "fmp"
    assert body["tz"] == "America/New_York"
    assert len(body["windows"]) == 2
    assert body["windows"][0]["name"] == "CPI"
    assert body["windows"][0]["meta"]["source"] == "fmp"


def test_no_trade_windows_fmp_skips_events_without_date(mod, monkeypatch):
    monkeypatch.setattr(mod, "fmp_economic_calendar", lambda f, t: {"data": [{"event": "No date event"}]})

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
    assert res.json()["detail"] == "calendar_fmp_failed"


def test_calendar_custom_range_returns_normalized_dates_and_windows(mod, tmp_path, monkeypatch):
    # Local no-trade config includes one event inside the custom range, one outside
    p = tmp_path / "no_trade_events.json"
    p.write_text(
        """
        {
          "timezone": "America/New_York",
          "events": [
            {"name": "Inside", "date": "2026-01-10", "time": "10:00", "buffer_min": 30},
            {"name": "Outside", "date": "2026-02-01", "time": "10:00", "buffer_min": 30}
          ]
        }
        """.strip(),
        encoding="utf-8",
    )
    monkeypatch.setattr(mod, "_NO_TRADE_JSON_PATH", Path(p))

    client = _make_client(mod)
    res = client.get(
        "/api/calendar/range/custom"
        "?start=2026-01-10&end=2026-01-12&tz=America/New_York"
    )

    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["tz"] == "America/New_York"
    # date-only becomes midnight, normalized to minute precision
    assert body["start"].startswith("2026-01-10T00:00:00")
    assert body["end"].startswith("2026-01-12T00:00:00")

    wins = body["no_trade_windows"]
    assert len(wins) == 1
    assert wins[0]["name"] == "Inside"


def test_calendar_custom_range_400_when_end_before_start(mod):
    client = _make_client(mod)
    res = client.get("/api/calendar/range/custom?start=2026-01-10&end=2026-01-09")
    assert res.status_code == 400
    assert res.json()["detail"] == "end must be >= start"
