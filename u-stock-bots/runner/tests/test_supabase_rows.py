from __future__ import annotations

from runner import supabase as sb


def test_build_rows_filters_non_transaction_events():
    events = [
        {"ts": "2026-01-01T00:00:00Z", "event_type": "order_submitted", "symbol": "aapl", "payload": {"order_id": "1"}},
        {"ts": "2026-01-01T00:00:01Z", "event_type": "debug_log", "symbol": "aapl", "payload": {"x": 1}},
        {"ts": "2026-01-01T00:00:02Z", "event_type": "order_failed", "symbol": "msft", "payload": {"order_id": "2"}},
    ]

    rows = sb._build_rows("ema_trend", "paper", events)
    assert len(rows) == 2
    assert {r["event_type"] for r in rows} == {"order_submitted", "order_failed"}
    assert {r["symbol"] for r in rows} == {"AAPL", "MSFT"}
    assert all("event_id" in r and r["event_id"] for r in rows)


def test_build_rows_normalizes_mode_and_level_and_symbol():
    events = [
        {
            "ts": "x",
            "event_type": "order_submitted",
            "level": "INFO",
            "symbol": " tsla ",
            "payload": {"order_id": "abc"},
        }
    ]
    rows = sb._build_rows("bot1", "LiVe", events)
    assert rows[0]["mode"] == "live"
    assert rows[0]["level"] == "info"
    assert rows[0]["symbol"] == "TSLA"


def test_event_id_is_deterministic_for_same_row_inputs():
    evt = {
        "ts": "2026-01-01T00:00:00Z",
        "event_type": "order_submitted",
        "symbol": "AAPL",
        "payload": {
            "order_id": "OID_123",
            "intent": {"entry": 100.0, "stop": 99.0, "take_profit": 102.0},
        },
    }
    rows1 = sb._build_rows("ema_trend", "paper", [evt])
    rows2 = sb._build_rows("ema_trend", "paper", [evt])

    assert len(rows1) == 1 and len(rows2) == 1
    assert rows1[0]["event_id"] == rows2[0]["event_id"]


def test_event_id_changes_when_key_parts_change():
    evt1 = {
        "ts": "t",
        "event_type": "order_submitted",
        "symbol": "AAPL",
        "payload": {"order_id": "OID_1", "intent": {"entry": 100.0, "stop": 99.0, "take_profit": 102.0}},
    }
    evt2 = {
        "ts": "t",
        "event_type": "order_submitted",
        "symbol": "AAPL",
        "payload": {"order_id": "OID_2", "intent": {"entry": 100.0, "stop": 99.0, "take_profit": 102.0}},
    }

    r1 = sb._build_rows("ema_trend", "paper", [evt1])[0]["event_id"]
    r2 = sb._build_rows("ema_trend", "paper", [evt2])[0]["event_id"]
    assert r1 != r2


def test_build_rows_uses_existing_event_id_if_present():
    evt = {
        "ts": "t",
        "event_type": "order_failed",
        "symbol": "AAPL",
        "event_id": "EXTERNAL_ID",
        "payload": {"order_id": "OID"},
    }
    row = sb._build_rows("ema_trend", "paper", [evt])[0]
    assert row["event_id"] == "EXTERNAL_ID"
