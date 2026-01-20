from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import runner.bot_runner as br


class FakeAPI:
    def __init__(self):
        self.get_calls: List[Tuple[str, Dict[str, Any]]] = []
        self.post_calls: List[Tuple[str, Dict[str, Any]]] = []
        self.responses: Dict[str, Any] = {}

    def set(self, path: str, value: Any) -> None:
        self.responses[path] = value

    def get(self, path: str, params: Optional[Dict[str, Any]] = None):
        self.get_calls.append((path, dict(params or {})))
        return self.responses.get(path, {})

    def post(self, path: str, json: Optional[Dict[str, Any]] = None):
        self.post_calls.append((path, dict(json or {})))
        return {"ok": True}


def test_extract_mode_cfg_prefers_status_mode_then_config_mode():
    mode, cfg = br._extract_mode_cfg({"mode": "LIVE", "config": {"mode": "paper", "x": 1}})
    assert mode == "live"
    assert cfg["x"] == 1

    mode2, cfg2 = br._extract_mode_cfg({"config": {"mode": "paper"}})
    assert mode2 == "paper"
    assert cfg2["mode"] == "paper"


def test_main_pauses_when_market_closed(monkeypatch):
    api = FakeAPI()

    # ✅ NEW contract: intent must be running
    api.set(
        "/api/bots/status",
        {
            "intent": "running",
            "effective_state": "running",
            "mode": "paper",
            "config": {},
        },
    )

    # market closed
    api.set("/api/market/us/session", {"ok": True, "is_open": False, "reason": "closed", "next_open": 123})

    # patch context manager behavior
    class _Ctx:
        def __enter__(self): return api
        def __exit__(self, exc_type, exc, tb): return False

    monkeypatch.setattr(br, "UStockAPI", lambda *a, **k: _Ctx())
    monkeypatch.setattr(br, "LOOP_SECONDS", 0)

    br.main(max_loops=1, sleep_fn=lambda s: None)

    # ✅ heartbeat waiting_for_market should be posted
    assert any(
        path == "/api/bots/heartbeat" and body.get("effective_state") == "waiting_for_market"
        for path, body in api.post_calls
    )
    # and it should carry the reason_code
    assert any(
        path == "/api/bots/heartbeat" and body.get("reason_code") == "market_closed"
        for path, body in api.post_calls
    )


def test_main_running_submits_intents_uploads_and_heartbeats(monkeypatch):
    api = FakeAPI()

    # ✅ NEW contract: intent must be running
    api.set(
        "/api/bots/status",
        {
            "intent": "running",
            "effective_state": "running",
            "mode": "paper",
            "config": {},
        },
    )
    api.set("/api/market/us/session", {"ok": True, "is_open": True})

    # strategy returns intents
    monkeypatch.setattr(
        br,
        "_compute_intents_for_ema_trend",
        lambda _api, _cfg: {
            "intents": [
                {
                    "symbol": "AAPL",
                    "side": "buy",
                    "entry": 1.0,
                    "stop": 0.5,
                    "take_profit": 2.0,
                    "confidence": 0.5,
                    "bot_id": "ema_trend",
                    "timeframe": "1Min",
                    "reason_codes": [],
                }
            ],
            "events": [],
        },
    )

    # engine returns tx events
    class FakeEngine:
        def __init__(self, mode: str): self.mode = mode
        def execute_intents(self, intents): return [{"event_type": "order_submitted"}]

    monkeypatch.setattr(br, "BotEngine", FakeEngine)

    uploaded: Dict[str, Any] = {}

    def fake_upload(bot_id, mode, events):
        uploaded["bot_id"] = bot_id
        uploaded["mode"] = mode
        uploaded["events"] = list(events)

    monkeypatch.setattr(br, "upload_transaction_events", fake_upload)

    # patch context manager
    class _Ctx:
        def __enter__(self): return api
        def __exit__(self, exc_type, exc, tb): return False

    monkeypatch.setattr(br, "UStockAPI", lambda *a, **k: _Ctx())
    monkeypatch.setattr(br, "LOOP_SECONDS", 0)

    br.main(max_loops=1, sleep_fn=lambda s: None)

    # intents submitted
    assert any(path == "/api/bots/submit-intents" for path, _ in api.post_calls)

    # upload called with tx event
    assert uploaded["mode"] == "paper"
    assert any(e.get("event_type") == "order_submitted" for e in uploaded["events"])

    # ✅ heartbeat running posted (effective_state)
    assert any(
        path == "/api/bots/heartbeat" and body.get("effective_state") == "running"
        for path, body in api.post_calls
    )
    assert any(
        path == "/api/bots/heartbeat" and body.get("reason_code") == "loop_ok"
        for path, body in api.post_calls
    )
