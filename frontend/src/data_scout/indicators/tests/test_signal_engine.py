# src/data_scout/indicators/tests/test_signal_engine.py

import json
from pathlib import Path

from data_scout.indicators import signal_engine


def test_build_final_signals_empty_inputs(tmp_path, monkeypatch):
    # Monkeypatch loaders to return empty maps
    monkeypatch.setattr(signal_engine, "load_daily_indicators", lambda root: {})
    monkeypatch.setattr(signal_engine, "load_intraday_indicators", lambda root: {})
    monkeypatch.setattr(signal_engine, "load_multiday_indicators", lambda root: {})

    payload = signal_engine.build_final_signals(tmp_path)

    assert isinstance(payload, dict)
    assert payload["universe"] == []
    assert payload["data"] == []


def test_build_final_signals_basic(tmp_path, monkeypatch):
    # Fake indicator maps
    def fake_daily(root: Path):
        return {
            "AAPL": {
                "in_play_score": 10.0,
                "close_return_1d": 0.02,
            }
        }

    def fake_intraday(root: Path):
        return {
            "AAPL": {
                "intraday_return": 0.01,
                "volume_spike_ratio": 2.0,
            }
        }

    def fake_multiday(root: Path):
        return {
            "AAPL": {
                "return_3d": 0.03,
                "return_5d": 0.05,
            }
        }

    monkeypatch.setattr(signal_engine, "load_daily_indicators", fake_daily)
    monkeypatch.setattr(signal_engine, "load_intraday_indicators", fake_intraday)
    monkeypatch.setattr(signal_engine, "load_multiday_indicators", fake_multiday)

    payload = signal_engine.build_final_signals(tmp_path)

    assert payload["universe"] == ["AAPL"]
    assert len(payload["data"]) == 1

    row = payload["data"][0]
    assert row["ticker"] == "AAPL"
    assert "score" in row


def test_save_final_signals_creates_file(tmp_path):
    payload = {
        "generatedAt": "2025-11-24T12:00:00Z",
        "rankingDescription": "test",
        "universe": ["AAPL"],
        "data": [],
    }

    out_path = signal_engine.save_final_signals(tmp_path, payload)

    assert out_path.exists()

    loaded = json.loads(out_path.read_text(encoding="utf-8"))
    assert loaded["generatedAt"] == payload["generatedAt"]
    assert loaded["universe"] == ["AAPL"]
