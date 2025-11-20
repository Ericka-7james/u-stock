from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from data_scout import macro as m


class DummyResponse:
  def __init__(self, payload: dict, status_code: int = 200):
      self._payload = payload
      self.status_code = status_code

  def raise_for_status(self) -> None:
      if self.status_code >= 400:
          raise RuntimeError(f"HTTP {self.status_code}")

  def json(self) -> dict:
      return self._payload


def test_fetch_latest_fred_observation_success(monkeypatch):
    """It should parse the latest observation value and date correctly."""

    def fake_get(url, params=None, timeout=10):
        assert "series/observations" in url
        # Just return one observation, newest first.
        payload = {
            "observations": [
                {
                    "date": "2025-01-01",
                    "value": "3.5",
                }
            ]
        }
        return DummyResponse(payload)

    monkeypatch.setattr(m.requests, "get", fake_get)

    result = m.fetch_latest_fred_observation("CPIAUCSL", api_key="dummy")

    assert result is not None
    assert result["date"] == "2025-01-01"
    assert result["value"] == pytest.approx(3.5)


def test_fetch_latest_fred_observation_non_numeric_value(monkeypatch):
    """If the value is not a float, latest should have value None."""

    def fake_get(url, params=None, timeout=10):
        payload = {
            "observations": [
                {
                    "date": "2025-01-01",
                    "value": "NotANumber",
                }
            ]
        }
        return DummyResponse(payload)

    monkeypatch.setattr(m.requests, "get", fake_get)

    result = m.fetch_latest_fred_observation("CPIAUCSL", api_key="dummy")

    assert result is not None
    assert result["date"] == "2025-01-01"
    assert result["value"] is None


def test_fetch_latest_fred_observation_handles_exception(monkeypatch, capsys):
    """If the HTTP call blows up, it should return None and log a message."""

    def fake_get(url, params=None, timeout=10):
        raise RuntimeError("boom")

    monkeypatch.setattr(m.requests, "get", fake_get)

    result = m.fetch_latest_fred_observation("CPIAUCSL", api_key="dummy")

    captured = capsys.readouterr()
    assert "[macro] Failed to fetch observations for CPIAUCSL" in captured.out
    assert result is None


def test_fetch_series_metadata_success(monkeypatch):
    """It should return the first series metadata from the FRED API."""

    def fake_get(url, params=None, timeout=10):
        assert "series" in url
        payload = {
            "seriess": [
                {
                    "id": "CPIAUCSL",
                    "title": "Consumer Price Index",
                    "units": "Index 1982-1984=100",
                    "frequency": "Monthly",
                    "source": "US. Bureau of Labor Statistics",
                }
            ]
        }
        return DummyResponse(payload)

    monkeypatch.setattr(m.requests, "get", fake_get)

    result = m.fetch_series_metadata("CPIAUCSL", api_key="dummy")

    assert result is not None
    assert result["id"] == "CPIAUCSL"
    assert result["units"] == "Index 1982-1984=100"
    assert result["frequency"] == "Monthly"
    assert result["source"].startswith("US. Bureau")


def test_fetch_series_metadata_handles_exception(monkeypatch, capsys):
    """If metadata fetch fails, it should return None and log a message."""

    def fake_get(url, params=None, timeout=10):
        raise RuntimeError("metadata error")

    monkeypatch.setattr(m.requests, "get", fake_get)

    result = m.fetch_series_metadata("UNRATE", api_key="dummy")

    captured = capsys.readouterr()
    assert "[macro] Failed to fetch metadata for UNRATE" in captured.out
    assert result is None


def test_fetch_macro_snapshot_no_api_key(monkeypatch):
    """When no VITE_FRED_API_KEY is set, snapshot should be empty with an error."""

    # Ensure env var is not set
    if "VITE_FRED_API_KEY" in os.environ:
        monkeypatch.delenv("VITE_FRED_API_KEY", raising=False)

    snapshot = m.fetch_macro_snapshot()

    assert "generatedAt" in snapshot
    assert isinstance(snapshot["generatedAt"], str)
    assert snapshot["series"] == []
    assert snapshot.get("error") == "VITE_FRED_API_KEY not set"


def test_fetch_macro_snapshot_happy_path(monkeypatch):
    """With an API key and successful fetches, snapshot should contain entries for DEFAULT_SERIES."""
    monkeypatch.setenv("VITE_FRED_API_KEY", "dummy-key")

    def fake_fetch_meta(series_id: str, api_key: str):
        return {
            "id": series_id,
            "units": f"Units-{series_id}",
            "frequency": f"Freq-{series_id}",
            "source": f"Source-{series_id}",
        }

    def fake_fetch_obs(series_id: str, api_key: str):
        # Use numeric suffix so each is different
        return {
            "date": "2025-01-01",
            "value": float(len(series_id)),
        }

    monkeypatch.setattr(m, "fetch_series_metadata", fake_fetch_meta)
    monkeypatch.setattr(m, "fetch_latest_fred_observation", fake_fetch_obs)

    snapshot = m.fetch_macro_snapshot()

    assert "generatedAt" in snapshot
    assert isinstance(snapshot["generatedAt"], str)

    series = snapshot["series"]
    # One entry per DEFAULT_SERIES item
    assert len(series) == len(m.DEFAULT_SERIES)

    ids_from_snapshot = {s["id"] for s in series}
    ids_from_default = {e["id"] for e in m.DEFAULT_SERIES}
    assert ids_from_snapshot == ids_from_default

    # Check one concrete example, e.g. CPIAUCSL
    cpi = next(s for s in series if s["id"] == "CPIAUCSL")
    assert cpi["label"] == "CPI (All Items)"
    assert cpi["latest"] == float(len("CPIAUCSL"))
    assert cpi["lastUpdated"] == "2025-01-01"
    assert cpi["units"] == "Units-CPIAUCSL"
    assert cpi["frequency"] == "Freq-CPIAUCSL"
    assert cpi["source"] == "Source-CPIAUCSL"


def test_write_snapshot_writes_json(tmp_path: Path):
    """write_snapshot should create the directory and write JSON to the given file."""
    snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "series": [
            {
                "id": "CPIAUCSL",
                "label": "CPI (All Items)",
                "latest": 3.5,
                "lastUpdated": "2025-01-01",
            }
        ],
    }

    out_file = tmp_path / "public" / "data" / "macro.json"
    m.write_snapshot(snapshot, output_file=out_file)

    assert out_file.exists()
    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded == snapshot


def test_main_calls_fetch_and_write(monkeypatch):
    """main() should call fetch_macro_snapshot and write_snapshot with the result."""
    fake_snapshot = {
        "generatedAt": "2025-11-18T12:00:00Z",
        "series": [],
    }

    fake_fetch = MagicMock(return_value=fake_snapshot)
    fake_write = MagicMock()

    monkeypatch.setattr(m, "fetch_macro_snapshot", fake_fetch)
    monkeypatch.setattr(m, "write_snapshot", fake_write)

    m.main()

    fake_fetch.assert_called_once()
    fake_write.assert_called_once_with(fake_snapshot)
