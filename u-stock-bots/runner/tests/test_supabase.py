# u-stock-bots/runner/tests/test_supabase.py
from __future__ import annotations

import json
from pathlib import Path

import pytest

from runner import supabase as sb


# -------------------------
# env helpers + sb_enabled
# -------------------------

def test_env_helpers(monkeypatch):
    monkeypatch.delenv("X", raising=False)
    assert sb._env("X") == ""
    assert sb._env_int("X", 7) == 7
    assert sb._env_float("X", 1.5) == 1.5
    assert sb._env_bool("X", True) is True

    monkeypatch.setenv("X", "  hi ")
    assert sb._env("X") == "hi"

    monkeypatch.setenv("X", "nope")
    assert sb._env_int("X", 7) == 7
    assert sb._env_float("X", 1.5) == 1.5

    monkeypatch.setenv("X", "1")
    assert sb._env_bool("X", False) is True
    monkeypatch.setenv("X", "false")
    assert sb._env_bool("X", True) is False


def test_sb_enabled_requires_flag_and_url_and_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_EVENTS_ENABLED", "true")
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    assert sb.sb_enabled() is False

    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    assert sb.sb_enabled() is False

    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "svc_key")
    assert sb.sb_enabled() is True

    monkeypatch.setenv("SUPABASE_EVENTS_ENABLED", "false")
    assert sb.sb_enabled() is False


# -------------------------
# normalizers
# -------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("paper", "paper"),
        ("live", "live"),
        (" LIVE ", "live"),
        ("weird", "paper"),
        ("", "paper"),
        (None, "paper"),
    ],
)
def test_normalize_mode(raw, expected):
    assert sb._normalize_mode(raw) == expected


def test_is_tx_event_only_whitelisted_types():
    assert sb._is_tx_event({"event_type": "order_submitted"}) is True
    assert sb._is_tx_event({"event_type": "risk_gate_block"}) is True
    assert sb._is_tx_event({"event_type": "scanner_note"}) is False
    assert sb._is_tx_event({"event_type": ""}) is False
    assert sb._is_tx_event({}) is False


def test_mask():
    assert sb._mask("") == ""
    assert sb._mask("a") == "****"
    assert sb._mask("abcd") == "****"
    assert sb._mask("abcdef") == "ab****ef"


# -------------------------
# deadletter
# -------------------------

def test_deadletter_path_uses_runtime_dir(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("RUNNER_RUNTIME_DIR", str(tmp_path))
    p = sb._deadletter_path()
    assert str(p).endswith("runtime/deadletter/supabase_events.jsonl")
    assert p.parent.exists()


def test_write_deadletter_writes_slim_preview(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("RUNNER_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setattr(sb, "_now_iso", lambda: "2026-02-24T00:00:00Z")

    rows = [
        {
            "ts": "t",
            "user_id": "u",
            "bot_id": "b",
            "mode": "paper",
            "event_type": "order_submitted",
            "symbol": "AAPL",
            "event_id": "EVT",
            "payload": {"order_id": "OID123", "secret": "dont_store_me"},
        },
        {
            "ts": "t2",
            "user_id": "u",
            "bot_id": "b",
            "mode": "paper",
            "event_type": "order_filled",
            "symbol": "MSFT",
            "event_id": "EVT2",
            "payload": {"id": "ALTID"},
        },
    ]

    sb._write_deadletter(rows, "boom")

    path = sb._deadletter_path()
    data = path.read_text(encoding="utf-8").strip().splitlines()
    assert len(data) == 1

    rec = json.loads(data[0])
    assert rec["ts"] == "2026-02-24T00:00:00Z"
    assert rec["error"] == "boom"
    assert rec["count"] == 2
    assert len(rec["rows"]) == 2
    assert rec["rows"][0]["order_id"] == "OID123"
    assert rec["rows"][1]["order_id"] == "ALTID"
    # Ensure only slim keys exist (no full payload dump)
    assert "payload" not in rec["rows"][0]
    assert "secret" not in json.dumps(rec)


# -------------------------
# event id hashing/idempotency
# -------------------------

def test_event_id_for_row_stable_and_sensitive_to_key_parts():
    row = {
        "bot_id": "ema_trend",
        "mode": "paper",
        "event_type": "order_submitted",
        "symbol": "AAPL",
        "payload": {"order_id": "OID", "intent": {"entry": 1, "stop": 2, "take_profit": 3}},
    }
    eid1 = sb._event_id_for_row(row)
    eid2 = sb._event_id_for_row(dict(row))
    assert eid1 == eid2

    row2 = dict(row)
    row2["payload"] = {"order_id": "OID2", "intent": {"entry": 1, "stop": 2, "take_profit": 3}}
    assert sb._event_id_for_row(row2) != eid1


# -------------------------
# row builder
# -------------------------

def test_build_rows_filters_to_tx_events_and_normalizes_payload_and_symbol(monkeypatch):
    monkeypatch.setattr(sb, "_now_iso", lambda: "2026-02-24T00:00:00Z")

    events = [
        {"event_type": "scanner_note", "payload": {"x": 1}},  # not tx -> dropped
        {"event_type": "order_submitted", "symbol": "aapl", "payload": {"order_id": "OID"}},
        {"event_type": "order_filled", "symbol": None, "payload": "raw_payload"},
        "not a dict",
    ]

    rows = sb._build_rows("u1", "b1", "LIVE", events)
    assert len(rows) == 2

    r0, r1 = rows
    assert r0["user_id"] == "u1"
    assert r0["bot_id"] == "b1"
    assert r0["mode"] == "live"
    assert r0["symbol"] == "AAPL"
    assert r0["payload"] == {"order_id": "OID"}
    assert r0["event_id"]  # explicit or hashed

    assert r1["symbol"] is None
    assert r1["payload"] == {"raw": "raw_payload"}
    assert r1["ts"] == "2026-02-24T00:00:00Z"


def test_build_rows_prefers_explicit_event_id(monkeypatch):
    monkeypatch.setattr(sb, "_now_iso", lambda: "t")

    events = [{"event_type": "order_submitted", "event_id": "DECISION1", "payload": {"order_id": "OID"}}]
    rows = sb._build_rows("u", "b", "paper", events)
    assert rows[0]["event_id"] == "DECISION1"


def test_build_rows_requires_user_and_bot():
    assert sb._build_rows("", "b", "paper", [{"event_type": "order_submitted"}]) == []
    assert sb._build_rows("u", "", "paper", [{"event_type": "order_submitted"}]) == []


# -------------------------
# table + headers
# -------------------------

def test_supabase_table_name_sanitizes(monkeypatch):
    monkeypatch.delenv("SUPABASE_EVENTS_TABLE", raising=False)
    assert sb._supabase_table_name() == sb.DEFAULT_TABLE

    monkeypatch.setenv("SUPABASE_EVENTS_TABLE", "custom_table_1")
    assert sb._supabase_table_name() == "custom_table_1"

    monkeypatch.setenv("SUPABASE_EVENTS_TABLE", "bad/table")
    assert sb._supabase_table_name() == sb.DEFAULT_TABLE

    monkeypatch.setenv("SUPABASE_EVENTS_TABLE", "bad-table")  # dash not allowed by regex
    assert sb._supabase_table_name() == sb.DEFAULT_TABLE


def test_supabase_headers_include_prefer_and_auth():
    h = sb._supabase_headers("KEY123")
    assert h["apikey"] == "KEY123"
    assert h["Authorization"] == "Bearer KEY123"
    assert h["Content-Type"] == "application/json"
    assert "ignore-duplicates" in h["Prefer"]


# -------------------------
# chunk iterator
# -------------------------

def test_chunk_iter_default_on_bad_size():
    xs = list(range(5))
    chunks = list(sb._chunk_iter(xs, 0))
    assert chunks == [xs]  # DEFAULT_BATCH_SIZE is big enough


def test_chunk_iter_splits():
    xs = [1, 2, 3, 4, 5]
    chunks = list(sb._chunk_iter(xs, 2))
    assert chunks == [[1, 2], [3, 4], [5]]


# -------------------------
# _post_rows
# -------------------------

def test_post_rows_noop_on_empty():
    sb._post_rows([])  # should not raise


def test_post_rows_raises_if_not_enabled(monkeypatch):
    monkeypatch.setattr(sb, "sb_enabled", lambda: False)
    with pytest.raises(RuntimeError, match="Supabase not configured"):
        sb._post_rows([{"x": 1}])


def test_post_rows_success_2xx(monkeypatch):
    monkeypatch.setattr(sb, "sb_enabled", lambda: True)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "KEY")
    monkeypatch.setenv("SUPABASE_EVENTS_TABLE", "bot_events")
    monkeypatch.setenv("SUPABASE_TIMEOUT", "3")

    class Resp:
        status_code = 201
        text = "ok"

    called = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        called["url"] = url
        called["headers"] = headers
        called["json"] = json
        called["timeout"] = timeout
        return Resp()

    monkeypatch.setattr(sb.requests, "post", fake_post)

    sb._post_rows([{"a": 1}])

    assert called["url"].endswith("/rest/v1/bot_events")
    assert called["headers"]["apikey"] == "KEY"
    assert called["timeout"] == 3
    assert called["json"] == [{"a": 1}]


def test_post_rows_non_2xx_raises_with_body_snippet(monkeypatch):
    monkeypatch.setattr(sb, "sb_enabled", lambda: True)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "KEY")
    monkeypatch.setenv("SUPABASE_EVENTS_TABLE", "bot_events")

    class Resp:
        status_code = 400
        text = "X" * 2000

    monkeypatch.setattr(sb.requests, "post", lambda *a, **k: Resp())

    with pytest.raises(RuntimeError, match="Supabase insert failed 400"):
        sb._post_rows([{"a": 1}])


# -------------------------
# upload_transaction_events (retries + deadletter + never-raise)
# -------------------------

def test_upload_transaction_events_noop_when_disabled(monkeypatch):
    monkeypatch.setattr(sb, "sb_enabled", lambda: False)
    sb.upload_transaction_events("u", "b", "paper", [{"event_type": "order_submitted"}])  # no raise


def test_upload_transaction_events_retries_then_succeeds(monkeypatch):
    monkeypatch.setattr(sb, "sb_enabled", lambda: True)
    monkeypatch.setenv("SUPABASE_BATCH_SIZE", "10")
    monkeypatch.setenv("SUPABASE_MAX_ATTEMPTS", "3")
    monkeypatch.setenv("SUPABASE_BACKOFF_SECONDS", "0.1")
    monkeypatch.setenv("SUPABASE_BACKOFF_JITTER", "0.0")
    monkeypatch.setenv("RUNNER_DEBUG", "false")

    # deterministic time.sleep
    sleeps = []
    monkeypatch.setattr(sb.time, "sleep", lambda s: sleeps.append(s))
    monkeypatch.setattr(sb, "_now_iso", lambda: "t")

    # One tx event -> one row -> one batch
    events = [{"event_type": "order_submitted", "payload": {"order_id": "OID"}}]

    calls = {"n": 0}

    def flaky_post_rows(rows):
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("flaky")
        return None

    monkeypatch.setattr(sb, "_post_rows", flaky_post_rows)

    # deadletter should not be called
    monkeypatch.setattr(sb, "_write_deadletter", lambda rows, error: (_ for _ in ()).throw(AssertionError("should not deadletter")))

    sb.upload_transaction_events("u", "b", "paper", events)

    assert calls["n"] == 3
    # should have slept twice (between attempts 1->2 and 2->3)
    assert len(sleeps) == 2
    assert all(s >= 0.05 for s in sleeps)


def test_upload_transaction_events_deadletters_after_max_attempts(monkeypatch):
    monkeypatch.setattr(sb, "sb_enabled", lambda: True)
    monkeypatch.setenv("SUPABASE_BATCH_SIZE", "10")
    monkeypatch.setenv("SUPABASE_MAX_ATTEMPTS", "2")
    monkeypatch.setenv("SUPABASE_BACKOFF_SECONDS", "0.1")
    monkeypatch.setenv("SUPABASE_BACKOFF_JITTER", "0.0")
    monkeypatch.setenv("RUNNER_DEBUG", "false")

    monkeypatch.setattr(sb.time, "sleep", lambda s: None)
    monkeypatch.setattr(sb, "_now_iso", lambda: "t")

    events = [{"event_type": "order_submitted", "payload": {"order_id": "OID"}}]

    monkeypatch.setattr(sb, "_post_rows", lambda rows: (_ for _ in ()).throw(RuntimeError("always bad")))

    dead = {}

    def fake_deadletter(rows, error):
        dead["rows"] = list(rows)
        dead["error"] = error

    monkeypatch.setattr(sb, "_write_deadletter", fake_deadletter)

    # must never raise
    sb.upload_transaction_events("u", "b", "paper", events)

    assert "rows" in dead
    assert len(dead["rows"]) == 1
    assert "always bad" in dead["error"]


def test_upload_transaction_events_chunks_batches(monkeypatch):
    monkeypatch.setattr(sb, "sb_enabled", lambda: True)
    monkeypatch.setenv("SUPABASE_BATCH_SIZE", "2")
    monkeypatch.setenv("SUPABASE_MAX_ATTEMPTS", "1")
    monkeypatch.setenv("SUPABASE_BACKOFF_SECONDS", "0.1")
    monkeypatch.setenv("SUPABASE_BACKOFF_JITTER", "0.0")
    monkeypatch.setenv("RUNNER_DEBUG", "false")

    monkeypatch.setattr(sb.time, "sleep", lambda s: None)
    monkeypatch.setattr(sb, "_now_iso", lambda: "t")

    events = [
        {"event_type": "order_submitted", "payload": {"order_id": "1"}},
        {"event_type": "order_filled", "payload": {"order_id": "2"}},
        {"event_type": "order_canceled", "payload": {"order_id": "3"}},
    ]

    batches = []

    def capture(rows):
        batches.append(list(rows))

    monkeypatch.setattr(sb, "_post_rows", capture)

    sb.upload_transaction_events("u", "b", "paper", events)

    assert len(batches) == 2
    assert len(batches[0]) == 2
    assert len(batches[1]) == 1