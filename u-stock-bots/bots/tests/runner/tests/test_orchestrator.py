from __future__ import annotations

import pytest

from runner import orchestrator as oc


class DummyAPI:
    pass


class DummyRiskState:
    pass


class DummyHBState:
    pass


@pytest.mark.parametrize(
    "raw,default,expected",
    [
        ("", True, True),
        ("", False, False),
        ("1", False, True),
        ("true", False, True),
        ("TrUe", False, True),
        ("yes", False, True),
        ("on", False, True),
        ("0", True, False),
        ("false", True, False),
        ("no", True, False),
        ("off", True, False),
        ("junk", True, False),
    ],
)
def test_env_bool(monkeypatch, raw, default, expected):
    monkeypatch.setenv("X_BOOL", raw)
    assert oc._env_bool("X_BOOL", default) is expected


@pytest.mark.parametrize(
    "raw,default,min_value,expected",
    [
        ("", 5, 0, 5),
        ("10", 5, 0, 10),
        ("-3", 5, 0, 0),
        ("-3", 5, 2, 2),
        ("junk", 5, 1, 5),
        ("0", 5, 1, 1),
    ],
)
def test_env_int(monkeypatch, raw, default, min_value, expected):
    monkeypatch.setenv("X_INT", raw)
    assert oc._env_int("X_INT", default, min_value=min_value) == expected


def test_sleep_smart_clamps_and_avoids_tight_loop():
    slept = {"s": None}

    def fake_sleep(x: float):
        slept["s"] = x

    oc._sleep_smart(-5, sleep_fn=fake_sleep)
    assert slept["s"] == 0.2

    oc._sleep_smart(0, sleep_fn=fake_sleep)
    assert slept["s"] == 0.2

    oc._sleep_smart(0.1, sleep_fn=fake_sleep)
    assert slept["s"] == 0.2

    oc._sleep_smart(2.5, sleep_fn=fake_sleep)
    assert slept["s"] == 2.5


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("paper", "paper"),
        ("live", "live"),
        (" PAPER ", "paper"),
        ("LiVe", "live"),
        ("", "paper"),
        (None, "paper"),
        ("sandbox", "paper"),
    ],
)
def test_normalize_mode(raw, expected):
    assert oc._normalize_mode(raw) == expected


def test_extract_mode_cfg_prefers_status_mode_then_cfg_mode():
    mode, cfg = oc._extract_mode_cfg({"mode": "live", "config": {"mode": "paper", "x": 1}})
    assert mode == "live"
    assert cfg == {"mode": "paper", "x": 1}

    mode, cfg = oc._extract_mode_cfg({"mode": None, "config": {"mode": "live", "x": 2}})
    assert mode == "live"
    assert cfg["x"] == 2

    mode, cfg = oc._extract_mode_cfg({"config": "nope"})
    assert mode == "paper"
    assert cfg == {}


def test_runner_user_id_prefers_runner_user_id_then_ustock_user_id(monkeypatch):
    monkeypatch.delenv("RUNNER_USER_ID", raising=False)
    monkeypatch.delenv("USTOCK_USER_ID", raising=False)
    assert oc._runner_user_id() == ""

    monkeypatch.setenv("USTOCK_USER_ID", "u2")
    assert oc._runner_user_id() == "u2"

    monkeypatch.setenv("RUNNER_USER_ID", "u1")
    assert oc._runner_user_id() == "u1"


def test_pick_user_id_from_status_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("RUNNER_USER_ID", "env_uid")

    assert oc._pick_user_id_from_status({"user_id": "status_uid"}) == "status_uid"
    assert oc._pick_user_id_from_status({"user_id": "  "}) == "env_uid"
    assert oc._pick_user_id_from_status({}) == "env_uid"


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("running", "running"),
        ("stopped", "stopped"),
        ("paused", "stopped"),
        (" PAUSED ", "stopped"),
        ("", ""),
        (None, ""),
        ("weird", ""),
    ],
)
def test_normalize_intent(raw, expected):
    assert oc._normalize_intent(raw) == expected


@pytest.mark.parametrize(
    "reason,expected",
    [
        ("", ""),
        (None, ""),
        ("blocked: no valid intents", "blocked_no_valid_intents"),
        ("some prefix blocked: no valid intents blah", "blocked_no_valid_intents"),
        ("soft_block: xyz", "soft_block"),
        ("SOFT_BLOCK something", "soft_block"),
        ("symbol not in allowlist: AAPL", "blocked_allowlist"),
        ("kill switch active", "blocked_killswitch"),
        ("paper-only gate", "blocked_paper_only"),
        ("other thing", "other thing"),
    ],
)
def test_bucket_gate_reason(reason, expected):
    assert oc._bucket_gate_reason(reason) == expected


def test_should_emit_block_event_on_reason_change_and_then_throttle():
    hb = DummyHBState()

    assert oc._should_emit_block_event(
        hb,
        mode="paper",
        gate_reason="blocked: no valid intents",
        now=100,
        block_log_min_seconds=30,
    ) is True
    assert getattr(hb, "last_block_sig") == "block_evt|paper|blocked_no_valid_intents"
    assert getattr(hb, "last_block_ts") == 100

    assert oc._should_emit_block_event(
        hb,
        mode="paper",
        gate_reason="blocked: no valid intents",
        now=110,
        block_log_min_seconds=30,
    ) is False

    assert oc._should_emit_block_event(
        hb,
        mode="paper",
        gate_reason="blocked: no valid intents",
        now=131,
        block_log_min_seconds=30,
    ) is True
    assert getattr(hb, "last_block_ts") == 131

    assert oc._should_emit_block_event(
        hb,
        mode="paper",
        gate_reason="kill switch active",
        now=140,
        block_log_min_seconds=30,
    ) is True
    assert getattr(hb, "last_block_sig") == "block_evt|paper|blocked_killswitch"


def test_should_emit_cadence_heartbeat_signature_change_and_then_throttle():
    state = oc.HeartbeatState()
    now = 100

    assert oc._should_emit_cadence_heartbeat(
        state,
        sig="loop_ok|paper",
        now=now,
        heartbeat_every_loops=3,
    ) is True

    assert oc._should_emit_cadence_heartbeat(
        state,
        sig="loop_ok|paper",
        now=now + 1,
        heartbeat_every_loops=3,
    ) is False

    assert oc._should_emit_cadence_heartbeat(
        state,
        sig="loop_ok|paper",
        now=now + 2,
        heartbeat_every_loops=3,
    ) is False

    assert oc._should_emit_cadence_heartbeat(
        state,
        sig="loop_ok|paper",
        now=now + 3,
        heartbeat_every_loops=3,
    ) is True

    assert oc._should_emit_cadence_heartbeat(
        state,
        sig="gated|paper|risk_gate",
        now=now + 4,
        heartbeat_every_loops=3,
    ) is True


def _patch_happy_path_deps(monkeypatch, *, status: dict, scan_events=None, strat_result=None, gated=None, gate_reason=""):
    calls = {
        "send_stopped": 0,
        "gate_market_hours": 0,
        "submit_intents": [],
        "upload_events": [],
        "sync_trade_fills": 0,
        "safe_heartbeat": [],
        "engine_execute": [],
        "record_orders_placed": [],
    }

    monkeypatch.setattr(oc.api_client, "get_status", lambda api, bot_id: status)

    def fake_send_stopped(api, hb_state, *, bot_id, status_mode, user_id):
        calls["send_stopped"] += 1
        calls["send_stopped_args"] = {"bot_id": bot_id, "status_mode": status_mode, "user_id": user_id}

    monkeypatch.setattr(oc, "send_stopped", fake_send_stopped)

    def fake_gate_market_hours(api, hb_state, *, bot_id, mode, user_id):
        calls["gate_market_hours"] += 1
        calls["gate_market_hours_args"] = {"bot_id": bot_id, "mode": mode, "user_id": user_id}

    monkeypatch.setattr(oc, "gate_market_hours", fake_gate_market_hours)

    monkeypatch.setattr(oc, "new_event_id", lambda: "EVT1")
    monkeypatch.setattr(oc, "now_iso", lambda: "2026-02-24T00:00:00Z")
    monkeypatch.setattr(oc, "now_epoch", lambda: 1000)

    if scan_events is None:
        scan_events = [{"event_type": "scan_note"}]
    monkeypatch.setattr(oc, "attach_scanner_context", lambda api, cfg: (cfg, list(scan_events)))

    monkeypatch.setattr(
        oc,
        "build_bot_cfg",
        lambda *, bot_id, status_cfg, scanner_ctx=None: {"final": True, **(status_cfg or {})},
    )

    if strat_result is None:
        strat_result = {"intents": [{"symbol": "AAPL"}], "events": [{"event_type": "strat_note"}]}
    monkeypatch.setattr(oc, "compute_bot_output", lambda api, bot_id, cfg: strat_result)

    monkeypatch.setattr(oc, "merge_events", lambda a, b: list(a or []) + list(b or []))

    def fake_attach_event_id(events, event_id):
        for event in events or []:
            if isinstance(event, dict):
                event["event_id"] = event_id

    monkeypatch.setattr(oc, "attach_event_id", fake_attach_event_id)

    if gated is None:
        gated = [{"symbol": "AAPL"}]
    monkeypatch.setattr(oc, "filter_intents_with_gates", lambda **kwargs: (list(gated), gate_reason))

    def fake_submit_intents(api, bot_id, intents, *, user_id):
        calls["submit_intents"].append({"bot_id": bot_id, "intents": intents, "user_id": user_id})

    monkeypatch.setattr(oc.api_client, "submit_intents", fake_submit_intents)

    def fake_upload(user_id, bot_id, mode, events):
        calls["upload_events"].append(
            {"user_id": user_id, "bot_id": bot_id, "mode": mode, "events": list(events)}
        )

    monkeypatch.setattr(oc, "upload_transaction_events", fake_upload)

    def fake_sync(api, *, bot_id, mode, user_id):
        calls["sync_trade_fills"] += 1
        calls["sync_trade_fills_args"] = {"bot_id": bot_id, "mode": mode, "user_id": user_id}

    monkeypatch.setattr(oc.api_client, "sync_trade_fills", fake_sync)

    def fake_safe_heartbeat(api, **kwargs):
        calls["safe_heartbeat"].append(kwargs)

    monkeypatch.setattr(oc, "safe_heartbeat", fake_safe_heartbeat)

    class FakeEngine:
        def __init__(self, *, mode: str):
            self.mode = mode

        def execute_intents(self, intents):
            calls["engine_execute"].append({"mode": self.mode, "intents": list(intents)})
            return [{"event_type": "order_submitted"}, {"event_type": "other"}]

    monkeypatch.setattr(oc, "BotEngine", FakeEngine)

    def fake_record(state, placed: int):
        calls["record_orders_placed"].append(placed)

    monkeypatch.setattr(oc, "record_orders_placed", fake_record)

    return calls


def test_run_once_raises_when_user_id_missing(monkeypatch):
    api = DummyAPI()
    risk = DummyRiskState()
    hb = DummyHBState()

    monkeypatch.setattr(oc.api_client, "get_status", lambda api, bot_id: {"intent": "running", "mode": "paper"})
    monkeypatch.delenv("RUNNER_USER_ID", raising=False)
    monkeypatch.delenv("USTOCK_USER_ID", raising=False)

    with pytest.raises(RuntimeError, match="Runner missing user_id"):
        oc.run_once(
            api,
            bot_id="ema_trend",
            respect_market_hours=False,
            risk_state=risk,
            hb_state=hb,
            heartbeat_every_loops=6,
            block_log_min_seconds=30,
        )


def test_run_once_sends_stopped_when_intent_not_running(monkeypatch):
    api = DummyAPI()
    risk = DummyRiskState()
    hb = DummyHBState()

    status = {"intent": "paused", "mode": "live", "user_id": "u1"}
    calls = _patch_happy_path_deps(monkeypatch, status=status)

    out_mode = oc.run_once(
        api,
        bot_id="ema_trend",
        respect_market_hours=True,
        risk_state=risk,
        hb_state=hb,
        heartbeat_every_loops=6,
        block_log_min_seconds=30,
    )

    assert out_mode == "live"
    assert calls["send_stopped"] == 1
    assert calls["send_stopped_args"] == {"bot_id": "ema_trend", "status_mode": "live", "user_id": "u1"}
    assert calls["gate_market_hours"] == 0
    assert calls["submit_intents"] == []
    assert calls["upload_events"] == []


def test_run_once_calls_market_gate_when_enabled(monkeypatch):
    api = DummyAPI()
    risk = DummyRiskState()
    hb = DummyHBState()

    status = {"intent": "running", "mode": "paper", "user_id": "u1", "config": {"mode": "live"}}
    calls = _patch_happy_path_deps(monkeypatch, status=status)

    out_mode = oc.run_once(
        api,
        bot_id="ema_trend",
        respect_market_hours=True,
        risk_state=risk,
        hb_state=hb,
        heartbeat_every_loops=6,
        block_log_min_seconds=30,
    )

    assert out_mode == "paper"
    assert calls["gate_market_hours"] == 1
    assert calls["gate_market_hours_args"]["mode"] == "paper"


def test_run_once_always_submits_strategy_intents_even_if_gated(monkeypatch):
    api = DummyAPI()
    risk = DummyRiskState()
    hb = DummyHBState()

    status = {"intent": "running", "mode": "paper", "user_id": "u1", "config": {"mode": "paper"}}
    calls = _patch_happy_path_deps(monkeypatch, status=status, gated=[], gate_reason="kill switch active")

    out_mode = oc.run_once(
        api,
        bot_id="ema_trend",
        respect_market_hours=False,
        risk_state=risk,
        hb_state=hb,
        heartbeat_every_loops=1,
        block_log_min_seconds=0,
    )

    assert out_mode == "paper"
    assert len(calls["submit_intents"]) == 1
    submitted = calls["submit_intents"][0]
    assert submitted["user_id"] == "u1"
    assert submitted["bot_id"] == "ema_trend"
    assert submitted["intents"] == [{"symbol": "AAPL"}]

    assert len(calls["upload_events"]) == 1
    uploaded = calls["upload_events"][0]
    assert uploaded["user_id"] == "u1"
    assert uploaded["bot_id"] == "ema_trend"
    assert uploaded["mode"] == "paper"
    event_types = [e.get("event_type") for e in uploaded["events"]]
    assert "scan_note" in event_types
    assert "strat_note" in event_types
    assert "risk_gate_block" in event_types

    assert len(calls["safe_heartbeat"]) == 1
    hb_call = calls["safe_heartbeat"][0]
    assert hb_call["reason_code"] == "risk_gate"
    assert hb_call["mode"] == "paper"
    assert "kill switch" in (hb_call["message"] or "")


def test_run_once_gated_without_reason_uploads_events_but_no_block_event(monkeypatch):
    api = DummyAPI()
    risk = DummyRiskState()
    hb = DummyHBState()

    status = {"intent": "running", "mode": "paper", "user_id": "u1", "config": {"mode": "paper"}}
    calls = _patch_happy_path_deps(monkeypatch, status=status, gated=[], gate_reason="")

    out_mode = oc.run_once(
        api,
        bot_id="ema_trend",
        respect_market_hours=False,
        risk_state=risk,
        hb_state=hb,
        heartbeat_every_loops=999999,
        block_log_min_seconds=999999,
    )

    assert out_mode == "paper"
    assert len(calls["upload_events"]) == 1
    event_types = [e.get("event_type") for e in calls["upload_events"][0]["events"]]
    assert "scan_note" in event_types
    assert "strat_note" in event_types
    assert "risk_gate_block" not in event_types
    assert len(calls["safe_heartbeat"]) == 1
    hb_call = calls["safe_heartbeat"][0]
    assert hb_call["reason_code"] == "no_valid_intents"
    assert hb_call["effective_state"] == "running"
    assert hb_call["message"] == "No actionable intents this loop."
    assert hb_call["mode"] == "paper"


def test_run_once_executes_when_not_gated_uploads_and_syncs(monkeypatch):
    api = DummyAPI()
    risk = DummyRiskState()
    hb = DummyHBState()

    status = {"intent": "running", "mode": "paper", "user_id": "u1", "config": {"mode": "live"}}
    calls = _patch_happy_path_deps(monkeypatch, status=status, gated=[{"symbol": "AAPL"}], gate_reason="")

    out_mode = oc.run_once(
        api,
        bot_id="ema_trend",
        respect_market_hours=False,
        risk_state=risk,
        hb_state=hb,
        heartbeat_every_loops=1,
        block_log_min_seconds=30,
    )

    assert out_mode == "paper"
    assert calls["engine_execute"] == [{"mode": "paper", "intents": [{"symbol": "AAPL"}]}]
    assert calls["record_orders_placed"] == [1]

    assert len(calls["upload_events"]) == 1
    uploaded = calls["upload_events"][0]
    assert uploaded["mode"] == "paper"
    event_types = [e.get("event_type") for e in uploaded["events"]]
    assert "scan_note" in event_types
    assert "strat_note" in event_types
    assert "order_submitted" in event_types

    assert calls["sync_trade_fills"] == 1
    assert calls["sync_trade_fills_args"] == {"bot_id": "ema_trend", "mode": "paper", "user_id": "u1"}

    assert len(calls["safe_heartbeat"]) == 1
    hb_call = calls["safe_heartbeat"][0]
    assert hb_call["reason_code"] == "loop_ok"
    assert hb_call["mode"] == "paper"
    assert hb_call["message"] == "Loop active."


def test_run_once_sync_trade_fills_errors_are_swallowed(monkeypatch):
    api = DummyAPI()
    risk = DummyRiskState()
    hb = DummyHBState()

    status = {"intent": "running", "mode": "paper", "user_id": "u1", "config": {"mode": "paper"}}
    calls = _patch_happy_path_deps(monkeypatch, status=status, gated=[{"symbol": "AAPL"}], gate_reason="")

    def boom(*args, **kwargs):
        raise RuntimeError("sync failed")

    monkeypatch.setattr(oc.api_client, "sync_trade_fills", boom)

    out_mode = oc.run_once(
        api,
        bot_id="ema_trend",
        respect_market_hours=False,
        risk_state=risk,
        hb_state=hb,
        heartbeat_every_loops=999999,
        block_log_min_seconds=999999,
    )

    assert out_mode == "paper"
    assert len(calls["upload_events"]) == 1


def test_main_respects_max_loops_and_sleeps(monkeypatch):
    sleeps = []

    def fake_sleep(x: float):
        sleeps.append(x)

    current = {"now": 1000.0}

    def fake_time():
        return current["now"]

    monkeypatch.setattr(oc.time, "time", fake_time)

    monkeypatch.setenv("USTOCK_API_BASE", "http://example")
    monkeypatch.setenv("RUNNER_LOOP_SECONDS", "1")
    monkeypatch.setenv("RUNNER_BOT_ID", "ema_trend")
    monkeypatch.setenv("RUNNER_RESPECT_MARKET_HOURS", "false")
    monkeypatch.setenv("RUNNER_HEARTBEAT_EVERY_LOOPS", "6")
    monkeypatch.setenv("RUNNER_BLOCK_LOG_MIN_SECONDS", "10")
    monkeypatch.setenv("RUNNER_DEBUG", "false")

    class FakeUStockAPI:
        def __init__(self, base_url: str, timeout: int):
            self.base_url = base_url
            self.timeout = timeout

        def __enter__(self):
            return DummyAPI()

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(oc, "UStockAPI", FakeUStockAPI)
    monkeypatch.setattr(oc, "run_once", lambda *args, **kwargs: "paper")

    oc.main(max_loops=2, sleep_fn=fake_sleep)

    assert len(sleeps) >= 1
    assert all(s >= 0.2 for s in sleeps)